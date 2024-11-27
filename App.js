const fs = require('fs');
const https = require('https');
const path = require('path');

const MAX_CONCURRENT_DOWNLOADS = 5; // Number of simultaneous downloads
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB in bytes

async function downloadVideos(startId, urlTemplate, outputDir) {
  let consecutiveFailures = 0;
  let lastSuccessfulUrl = null;
  let activeTasks = 0;
  let currentId = startId;

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Helper function to manage the download queue
  const addTask = async () => {
    if (consecutiveFailures >= 80) return; // Stop if too many failures

    const id = currentId++;
    const videoUrl = urlTemplate.replace('{id}', id);
    const fileName = `${id}.mp4`;
    const filePath = path.join(outputDir, fileName);

    activeTasks++;
    try {
      console.log(`Checking video: ${videoUrl}`);
      const fileSize = await getFileSize(videoUrl);

      if (fileSize > MAX_FILE_SIZE) {
        console.log(`Skipped: ${fileName} (File size ${(fileSize / (1024 * 1024)).toFixed(2)} MB exceeds limit)`);
      } else {
        console.log(`Downloading: ${videoUrl}`);
        await downloadFile(videoUrl, filePath);
        console.log(`Downloaded: ${fileName}`);
        lastSuccessfulUrl = videoUrl;
        consecutiveFailures = 0; // Reset failure count on success
      }
    } catch (err) {
      console.log(`Failed: ${videoUrl} (${err.message})`);
      consecutiveFailures++;
    } finally {
      activeTasks--;
      // Automatically add the next task to keep queue full
      addTask();
    }
  };

  // Start initial download tasks
  for (let i = 0; i < MAX_CONCURRENT_DOWNLOADS; i++) {
    addTask();
  }

  // Wait for all tasks to complete
  while (activeTasks > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
  }

  console.log(`Stopped after ${consecutiveFailures} consecutive failures.`);
  console.log(`Last successful URL: ${lastSuccessfulUrl}`);
  return lastSuccessfulUrl;
}

function getFileSize(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { method: 'HEAD' }, (response) => {
      if (response.statusCode === 200) {
        const contentLength = parseInt(response.headers['content-length'], 10);
        resolve(contentLength);
      } else {
        reject(new Error(`HTTP Status: ${response.statusCode}`));
      }
    }).on('error', (err) => reject(err));
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP Status: ${response.statusCode}`));
        response.resume(); // Consume response to free up memory
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err)); // Delete file on error
    });
  });
}

// Usage
const startId = 15440; // Starting video ID
const urlTemplate = 'https://server3.masahub.cc/myfiless/id/{id}.mp4'; // URL template
const outputDir = './videos'; // Output directory

downloadVideos(startId, urlTemplate, outputDir)
  .then((lastUrl) => console.log(`Script finished. Last successful URL: ${lastUrl}`))
  .catch((err) => console.error(`Error: ${err.message}`));
