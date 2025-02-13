import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import PQueue from "p-queue";
import { URL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicPath = path.join(__dirname, "public");

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use("/link_checker", express.static(publicPath));

app.get("", (req, res) => { 
	res.sendFile(path.join(publicPath, "index.html"));
});

const axiosInstance = axios.create({
    timeout: 10000,
    maxRedirects: 5,
    validateStatus: () => true,
});

// concurrency limit
const queue = new PQueue({ concurrency: 300 });

// Limiting the max requests for a domain to 5 URLs
const domainRequests = new Map();
const MAX_REQUESTS_PER_DOMAIN = 5;

const getDomain = (url) => {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return null;
    }
};

// slow down the requests
const waitForDomainSlot = async (domain) => {
    if (!domainRequests.has(domain)) {
        domainRequests.set(domain, 0);
    }

    while (domainRequests.get(domain) >= MAX_REQUESTS_PER_DOMAIN) {
        await new Promise((resolve) => {
            setTimeout(resolve, 500); // checks every 500ms instead of spamming
        });
    }

    domainRequests.set(domain, domainRequests.get(domain) + 1);
};


const checkLink = async (url) => {
    const domain = getDomain(url);
    if (!domain) {
        return { url, status: "invalid", statusCode: "N/A", error: "Invalid URL" };
    }

    await waitForDomainSlot(domain);

   // console.log(`[${domain}] Active Requests: ${domainRequests.get(domain)}`);

    try {
        const response = await axiosInstance.get(url);
        return {
            url,
            status: response.status === 200 ? "alive" : "dead",
            statusCode: response.status,
        };
    } catch (error) {
        let errorMsg = error.message;
        if (error.code === "ECONNABORTED") {
          errorMsg = "Connection timed out.";
        }
        return {
          url,
          status: "dead",
          statusCode: "N/A",
          error: errorMsg,
        };
    } finally {
        // subtract the counter when the request finishes
        domainRequests.set(domain, domainRequests.get(domain) - 1);
       // console.log(`[${domain}] Active Requests after completion: ${domainRequests.get(domain)}`);
    }
};

const checkLinksBatch = async (links) => {
    return await Promise.all(links.map((link) => queue.add(() => checkLink(link))));
};

// API Endpoint
app.post("/link_checker/check-links", async (req, res) => {
    const { links } = req.body;
    if (!Array.isArray(links)) {
        return res.status(400).json({ error: "Invalid input. Provide an array of URLs." });
    }

    try {
        console.time("Check Links");
        const results = await checkLinksBatch(links);
        console.timeEnd("Check Links");
        res.json({ results, total: links.length });
    } catch (error) {
        console.error("Error checking links:", error);
        res.status(500).json({ error: "Error checking links" });
    }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

