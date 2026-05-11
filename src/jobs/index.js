async function addEmailJob(data) {
  console.log("📧 Email job:", data);
  return true;
}

async function initQueues() {
  console.log("✅ Queues initialized");
}

module.exports = {
  addEmailJob,
  initQueues,
};
