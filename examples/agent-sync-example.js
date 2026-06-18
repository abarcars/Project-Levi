// examples/agent-sync-example.js
// Example: How a Copilot agent uses the Node.js SDK to sync memory.
// This shows how to integrate sync into your agent workflow.

const { CoJanetSyncClient } = require("../src/lib/cojanetSyncClient-node.js");

// Initialize client with server URL and auth
const client = new CoJanetSyncClient({
  serverUrl: process.env.COJANET_SERVER_URL || "http://localhost:8787",
  projectId: process.env.COJANET_PROJECT_ID || "career-ops",
  clientToken: process.env.COJANET_CLIENT_TOKEN || "",
});

// Example 1: Agent A - Pull memory, add learned patterns, push
async function agentA_analyzeResume() {
  console.log("\n=== Agent A: Resume Analyzer ===");

  // Pull current memory to see what's already been learned
  console.log("Pulling memory from server...");
  const memory = await client.pullMemory();
  console.log(`Loaded ${memory.learnedPatterns?.length || 0} learned patterns`);

  // Simulate analysis: discover new patterns
  const newPatterns = [
    {
      id: `pattern-${Date.now()}`,
      pattern: "Use quantified metrics in accomplishments",
      context: "resume-writing",
      evidence: "Resumes with numbers get 30% more callbacks",
      updatedAt: new Date().toISOString(),
    },
    {
      id: `pattern-${Date.now() + 1}`,
      pattern: "Lead with impact, not tasks",
      context: "resume-writing",
      evidence: "Action verbs (e.g., 'Led', 'Owned') rank higher",
      updatedAt: new Date().toISOString(),
    },
  ];

  console.log(`Discovered ${newPatterns.length} new patterns`);

  // Push new patterns to server
  const localMemory = {
    ...memory,
    learnedPatterns: [...(memory.learnedPatterns || []), ...newPatterns],
    updatedAt: new Date().toISOString(),
  };

  console.log("Pushing patterns to server...");
  await client.pushMemory(localMemory, "merge");
  console.log("✓ Patterns saved to server");
}

// Example 2: Agent B - Pull and use Agent A's learned patterns
async function agentB_updateResume() {
  console.log("\n=== Agent B: Resume Updater ===");

  // Pull current memory (includes Agent A's patterns)
  console.log("Pulling memory from server...");
  const memory = await client.pullMemory();
  const patterns = memory.learnedPatterns || [];

  console.log(`Retrieved ${patterns.length} learned patterns:`);
  patterns.forEach((p) => {
    console.log(`  - ${p.pattern}`);
  });

  // Simulate using patterns to update resume
  const updatedArtifact = {
    id: `resume-${Date.now()}`,
    type: "resume",
    title: "Updated Resume",
    content: "## Experience\n\nLed team of 5 engineers, increasing deployment speed by 40%...",
    appliedPatterns: patterns.map((p) => p.id),
    updatedAt: new Date().toISOString(),
  };

  console.log("Updating resume based on learned patterns...");

  // Push updated artifact
  const localMemory = {
    ...memory,
    artifacts: [...(memory.artifacts || []), updatedArtifact],
    updatedAt: new Date().toISOString(),
  };

  console.log("Pushing updated resume to server...");
  await client.pushMemory(localMemory, "merge");
  console.log("✓ Resume saved to server");
}

// Example 3: Agent C - Track a job application
async function agentC_trackJob() {
  console.log("\n=== Agent C: Job Tracker ===");

  console.log("Pulling memory from server...");
  const memory = await client.pullMemory();

  // Add a new job
  const newJob = {
    id: `job-${Date.now()}`,
    title: "Senior Product Manager",
    company: "TechCorp",
    status: "applied",
    appliedDate: new Date().toISOString(),
    notes: "Found via LinkedIn, applied resume version 3",
    updatedAt: new Date().toISOString(),
  };

  console.log(`Tracking new job: ${newJob.title} at ${newJob.company}`);

  const localMemory = {
    ...memory,
    jobs: [...(memory.jobs || []), newJob],
    updatedAt: new Date().toISOString(),
  };

  console.log("Pushing job to server...");
  await client.pushMemory(localMemory, "merge");
  console.log("✓ Job saved to server");
}

// Main: run all examples sequentially
(async () => {
  try {
    console.log("Co-Janet Sync - Agent Example\n");
    console.log(`Server: ${client.serverUrl}`);
    console.log(`Project: ${client.projectId}`);
    console.log(`Client Token: ${client.clientToken ? "set" : "not set"}\n`);

    // Run agents in sequence to simulate real workflow
    await agentA_analyzeResume();
    await agentB_updateResume();
    await agentC_trackJob();

    // Pull final state
    console.log("\n=== Final State ===");
    const finalMemory = await client.pullMemory();
    console.log(`Learned patterns: ${finalMemory.learnedPatterns?.length || 0}`);
    console.log(`Artifacts: ${finalMemory.artifacts?.length || 0}`);
    console.log(`Jobs: ${finalMemory.jobs?.length || 0}`);
    console.log("\n✓ All agents synced successfully");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
