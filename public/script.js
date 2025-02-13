document.addEventListener("DOMContentLoaded", () => {
    const pagination = document.getElementById("pagination");
    const resultsBody = document.querySelector("#resultsTable tbody");
    const urlInput = document.getElementById("urlInput");
    const checkLinksButton = document.getElementById("check-links-button");
    const loading = document.getElementById("loading");
    const resultsTable = document.getElementById("resultsTable");
    const progressBar = document.getElementById("progressBar");
    const filterDropdown = document.getElementById("filter");
    const searchInput = document.getElementById("search-input");


    let allResults = [];
    let filteredResults = [];

	
    let currentPage = 1;
    const pageSize = 10;
    const chunkSize = 100;

    const applyFilterAndSearch = () => {
        const filter = filterDropdown.value;
        const searchTerm = searchInput.value.toLowerCase();
    

	// make it multiselect?? not sure    
        const matchesFilter = ({ status }) => {
            if (filter === "alive") {
                return status === "alive";
            } else if (filter === "dead") {
                return status === "dead"; // Only Dead (404)
            } else if (filter === "forbidden") {
                return status === "forbidden"; // Only Forbidden (403)
            } else if (filter === "error") {
               return status === "error"; // Only Error
            } else {
                return true; //Else, show "All" results !
            }
        };
    
        const matchesSearch = ({ url }) => url.toLowerCase().includes(searchTerm);
    
        filteredResults = allResults.filter((result) => matchesFilter(result) && matchesSearch(result));
    
        currentPage = 1;
        renderResults(currentPage);
    };
        
    const renderResults = (page) => {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const paginatedResults = filteredResults.slice(start, end);
    
        resultsBody.innerHTML = "";
    
        paginatedResults.forEach(({ url, status, statusCode, error }) => {
            const row = document.createElement("tr");

            let statusClass = "";
            if (status === "forbidden") {
              statusClass = "bad-status forbidden-status";
            } else if (status === "dead") {
              statusClass = "bad-status";
            } else if (status === "error") {
              statusClass = "error-status";
            } else {
              statusClass = "";
            }
            
            row.innerHTML = `
    <td>
        <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>
    </td>
    <td class="${statusClass}">
        ${status === "error" ? status : `${status} (${statusCode || "N/A"})`}
        ${error ? '<button class="toggle-error" title="Toggle Error Details"></button>' : ""}
    </td>
`;

            resultsBody.appendChild(row);
    
            // If there's an error message, show the details
            if (error) {
                const errorRow = document.createElement("tr");
                errorRow.classList.add("error-details");
                errorRow.style.display = "none";
    
                const errorCell = document.createElement("td");
                errorCell.colSpan = 2;
                errorCell.textContent = error;
                errorRow.appendChild(errorCell);
                resultsBody.appendChild(errorRow);
    
                row.querySelector(".toggle-error").addEventListener("click", function () {
                    if (errorRow.style.display === "none") {
                        errorRow.style.display = "";
                    } else {
                        errorRow.style.display = "none";
                    }
                });
            }
        });
    
        resultsTable.style.display = "table";
        createPagination(filteredResults.length, page);
        document.getElementById("table-controls").style.display = "block";
    };
    
    const createPagination = (total, current) => {
        pagination.innerHTML = "";

        const totalPages = Math.ceil(total / pageSize);
        const maxVisiblePages = 5;
 
        if (totalPages <= 1) return;

        const prevButton = document.createElement("button");
        prevButton.textContent = "←";
        prevButton.disabled = current === 1;
        prevButton.addEventListener("click", () => {
            if (current > 1) {
                currentPage--;
                renderResults(currentPage);
            }
        });
        pagination.appendChild(prevButton);
  
        const addPageButton = (page) => {
            const pageButton = document.createElement("button");
            pageButton.textContent = page;
            pageButton.classList.add("pagination-button");
            pageButton.classList.toggle("active", page === current);
            pageButton.disabled = page === current;
            pageButton.addEventListener("click", () => {
                currentPage = page;
                renderResults(page);
            });
            pagination.appendChild(pageButton);
        };

        const addEllipsis = () => {
            const ellipsis = document.createElement("span");
            ellipsis.textContent = "...";
            ellipsis.classList.add("pagination-ellipsis");
            pagination.appendChild(ellipsis);
        };

        let startPage = Math.max(1, current - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, current + Math.floor(maxVisiblePages / 2));

        if (startPage > 1) {
            addPageButton(1);
            if (startPage > 2) addEllipsis();
        }

        for (let i = startPage; i <= endPage; i++) {
            addPageButton(i);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) addEllipsis();
            addPageButton(totalPages);
        }

	// still not showing the right arrow color     
        const nextButton = document.createElement("button");
        nextButton.textContent = "→";
        nextButton.disabled = current === totalPages;
        nextButton.addEventListener("click", () => {
            if (current < totalPages) {
                currentPage++;
                renderResults(currentPage);
            }
        });
        pagination.appendChild(nextButton);
    };

    const processChunk = async (chunk) => {
        try {
            const response = await fetch("/link_checker/check-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ links: chunk }),
            });
    
            if (!response.ok) throw new Error("Failed to check links.");
    
            const { results } = await response.json();
    
            return results.map((result) => ({
                ...result,
                status: result.statusCode === 403 ? "forbidden" :
                        result.statusCode === 404 ? "dead" :
                        result.statusCode === 200 ? "alive" :
                        "error", 
                statusCode: result.statusCode || "N/A",
            }));
        } catch (error) {
           // console.error("Error processing chunk:", error);
            return chunk.map((url) => ({
                url,
                status: "error",
                statusCode: "N/A",
                error: "Failed to process",
            }));
        }
    };
    
    // in chunks of 100 bc why not
    const updateProgressBar = (currentChunk, totalChunks) => {
        const progress = Math.round((currentChunk / totalChunks) * 100);
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${progress}%`;
    };


    checkLinksButton.addEventListener("click", async () => {
       // console.time("Total Link Check Time");
    
        const urls = urlInput.value.split(/\r?\n/).filter((url) => url.trim());
        if (!urls.length) {
            alert("Please enter at least one URL.");
            return;
        }
    
        loading.style.display = "block";
        resultsTable.style.display = "none";
        pagination.style.display = "none";
        allResults = [];
        progressBar.style.width = "0%";
        document.getElementById("loadingContainer").style.display = "block";
    
        const totalChunks = Math.ceil(urls.length / chunkSize);
        const chunks = [];
    
        for (let i = 0; i < urls.length; i += chunkSize) {
            chunks.push(urls.slice(i, i + chunkSize));
        }
    
        for (let i = 0; i < chunks.length; i++) {
           // console.time(`Chunk ${i + 1} Processing Time`);
            const chunkResults = await processChunk(chunks[i]);
           // console.timeEnd(`Chunk ${i + 1} Processing Time`);
    
            allResults.push(...chunkResults);
            updateProgressBar(i + 1, totalChunks);
        }
    
       // console.timeEnd("Total Link Check Time");
    
        filteredResults = allResults;
        currentPage = 1;
        renderResults(currentPage);
    
        loading.style.display = "none";
        document.getElementById("loadingContainer").style.display = "none";
    
        pagination.style.display = "block";
    });
    
    document.getElementById("clear-links-button").addEventListener("click", () => {
        allResults = [];
        filteredResults = [];
        currentPage = 1;

        urlInput.value = "";
        filterDropdown.value = "all";
        searchInput.value = "";

        resultsBody.innerHTML = "";
        pagination.innerHTML = "";
        progressBar.style.width = "0%";
        progressBar.textContent = "";
        resultsTable.style.display = "none";
        loading.style.display = "none";

        document.getElementById("table-controls").style.display = "none";
    });

    filterDropdown.addEventListener("change", applyFilterAndSearch);
    searchInput.addEventListener("input", applyFilterAndSearch);

    const exportToCSV = () => {
        const rows = [["URL", "Status Code", "Status"]]; 
        filteredResults.forEach(({ url, status, statusCode }) => {
            const sanitizedUrl = url.replace(/"/g, '""'); 
            const sanitizedStatus = status.replace(/"/g, '""').trim(); 
            const sanitizedStatusCode = statusCode ? statusCode.toString().replace(/"/g, '""') : "N/A"; 
            rows.push([`"${sanitizedUrl}"`, `"${sanitizedStatusCode}"`, `"${sanitizedStatus}"`]); 
        });
    
        const csvContent = rows.map((row) => row.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "link-status-results.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }; 
    
    document.getElementById("export-button").addEventListener("click", exportToCSV);
});

