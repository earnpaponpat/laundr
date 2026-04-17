try {
  console.log("Importing next...");
  const next = require('next');
  console.log("Next imported successfully.");
  console.log("Version:", next.version || "unknown");
} catch (e) {
  console.error("Failed to import next:", e);
}
