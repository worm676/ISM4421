// Resilience Enterprise AI City: the data behind the 3D scene.
// Districts are departments, buildings are AI tools/systems, agents walk
// between buildings doing tasks. Edit this file to change the city.

export const HQ = {
  id: "hq",
  name: "Resilience AI Core",
  district: "hq",
  role: "Headquarters. Orchestrates every agent, routes work between districts and keeps the owner's dashboard current.",
  tools: ["Claude", "Owner dashboard"],
  links: ["sdr", "ghl", "make", "ops", "copy", "claude-code"],
};

// Listed in ring order: roads join each district to its neighbours and to HQ.
export const DISTRICTS = [
  { id: "sales", name: "Sales District", color: "#f2b632" },
  { id: "crm", name: "CRM Quarter", color: "#4c8dff" },
  { id: "automation", name: "Automation Works", color: "#a36bff" },
  { id: "delivery", name: "Delivery Park", color: "#35c98a" },
  { id: "creative", name: "Creative Studio", color: "#ff6fa8" },
  { id: "build", name: "Build Lab", color: "#2fd3e0" },
];

// slot: position around the district square (0-3). height in scene units.
export const BUILDINGS = [
  { id: "scraper", district: "sales", slot: 0, height: 7, name: "Lead Scraper", role: "Finds businesses that fit the ideal client profile and pulls their contact data.", tools: ["Firecrawl", "Google Maps"], links: ["sdr"] },
  { id: "sdr", district: "sales", slot: 1, height: 11, name: "AI SDR", role: "Writes first-touch outreach and qualifies replies before a human ever gets on a call.", tools: ["Claude", "Gmail"], links: ["ghl", "booking"] },
  { id: "proposal", district: "sales", slot: 2, height: 8, name: "Proposal Writer", role: "Turns discovery notes into a scoped proposal and pricing.", tools: ["Claude", "Google Docs"], links: ["booking", "pipeline"] },
  { id: "booking", district: "sales", slot: 3, height: 5, name: "Booking Bot", role: "Books discovery and closing calls into the calendar.", tools: ["Google Calendar", "GoHighLevel"], links: ["ghl"] },

  { id: "ghl", district: "crm", slot: 0, height: 14, name: "GoHighLevel Tower", role: "Single source of truth for every contact, deal and conversation.", tools: ["GoHighLevel"], links: ["pipeline", "followup", "webhooks"] },
  { id: "pipeline", district: "crm", slot: 1, height: 8, name: "Pipeline Tracker", role: "Moves deals through stages and flags anything stuck.", tools: ["GoHighLevel"], links: ["proposal", "ghl"] },
  { id: "followup", district: "crm", slot: 2, height: 6, name: "Follow-up Sequencer", role: "Runs SMS and email nurture so no lead goes cold.", tools: ["GoHighLevel", "Twilio"], links: ["sdr"] },

  { id: "make", district: "automation", slot: 0, height: 10, name: "Make.com Plant", role: "Moves data between apps when a deal closes: invoices, folders, kickoff tasks.", tools: ["Make.com"], links: ["onboarding", "webhooks"] },
  { id: "n8n", district: "automation", slot: 1, height: 9, name: "n8n Plant", role: "Self-hosted workflows for heavier, custom automations.", tools: ["n8n"], links: ["make", "reporting"] },
  { id: "webhooks", district: "automation", slot: 2, height: 5, name: "Webhook Hub", role: "Receives events from the CRM and fans them out to workflows.", tools: ["Webhooks"], links: ["make", "n8n"] },

  { id: "onboarding", district: "delivery", slot: 0, height: 8, name: "Onboarding Agent", role: "Welcomes new clients, collects access and assets, schedules kickoff.", tools: ["Claude", "Gmail"], links: ["ops"] },
  { id: "ops", district: "delivery", slot: 1, height: 12, name: "Project Ops", role: "Breaks delivery into tasks, assigns them and tracks deadlines.", tools: ["Project board"], links: ["reporting", "web-builder"] },
  { id: "reporting", district: "delivery", slot: 2, height: 7, name: "Client Reporting", role: "Sends clients weekly results and flags upsell opportunities.", tools: ["Claude", "Google Sheets"], links: ["hq"] },

  { id: "visuals", district: "creative", slot: 0, height: 9, name: "Brand Visuals", role: "Produces ad creative, social graphics and mockups.", tools: ["ChatGPT image"], links: ["scheduler"] },
  { id: "copy", district: "creative", slot: 1, height: 7, name: "Copywriter", role: "Writes ads, landing pages and email copy in the client's voice.", tools: ["Claude"], links: ["visuals", "sdr"] },
  { id: "scheduler", district: "creative", slot: 2, height: 5, name: "Content Scheduler", role: "Queues and publishes content across channels.", tools: ["Social scheduler"], links: ["booking"] },

  { id: "claude-code", district: "build", slot: 0, height: 13, name: "Claude Code Lab", role: "Builds and fixes websites, funnels and integrations from a prompt.", tools: ["Claude Code", "GitHub"], links: ["qa", "web-builder"] },
  { id: "web-builder", district: "build", slot: 1, height: 8, name: "Web & App Builder", role: "Ships client sites and apps to production.", tools: ["Netlify", "Supabase"], links: ["ops"] },
  { id: "qa", district: "build", slot: 2, height: 6, name: "QA Bot", role: "Tests every release before a client sees it.", tools: ["Playwright"], links: ["web-builder"] },
];

// Each agent loops through its steps: walk to the building, work there for
// `secs` seconds, then move on. `count` bumps a city counter when a step finishes.
export const AGENTS = [
  { id: "scout", name: "Scout", district: "sales", role: "Prospecting agent", steps: [
    { at: "scraper", task: "Scraping local leads", secs: 4 },
    { at: "sdr", task: "Handing off 25 leads", secs: 2, count: "leads" },
  ] },
  { id: "nova", name: "Nova", district: "sales", role: "AI SDR", steps: [
    { at: "sdr", task: "Writing outreach", secs: 3 },
    { at: "followup", task: "Qualifying replies", secs: 3 },
    { at: "ghl", task: "Logging qualified lead", secs: 2, count: "qualified" },
    { at: "booking", task: "Booking discovery call", secs: 2 },
  ] },
  { id: "atlas", name: "Atlas", district: "sales", role: "Closer assistant", steps: [
    { at: "pipeline", task: "Pulling deal notes", secs: 2 },
    { at: "proposal", task: "Drafting proposal", secs: 4 },
    { at: "ghl", task: "Marking deal won", secs: 2, count: "deals" },
  ] },
  { id: "relay", name: "Relay", district: "automation", role: "Automation runner", steps: [
    { at: "webhooks", task: "Catching deal-won event", secs: 2 },
    { at: "make", task: "Creating invoice + folders", secs: 3 },
    { at: "onboarding", task: "Triggering onboarding", secs: 2 },
  ] },
  { id: "harbor", name: "Harbor", district: "delivery", role: "Onboarding agent", steps: [
    { at: "onboarding", task: "Collecting client assets", secs: 4 },
    { at: "ops", task: "Planning delivery tasks", secs: 3 },
  ] },
  { id: "pulse", name: "Pulse", district: "delivery", role: "Reporting agent", steps: [
    { at: "ops", task: "Checking task status", secs: 2 },
    { at: "n8n", task: "Pulling results data", secs: 3 },
    { at: "reporting", task: "Sending weekly report", secs: 3, count: "reports" },
    { at: "hq", task: "Updating owner dashboard", secs: 2 },
  ] },
  { id: "muse", name: "Muse", district: "creative", role: "Content agent", steps: [
    { at: "copy", task: "Writing ad copy", secs: 3 },
    { at: "visuals", task: "Generating creative", secs: 3 },
    { at: "scheduler", task: "Scheduling posts", secs: 2, count: "posts" },
  ] },
  { id: "forge", name: "Forge", district: "build", role: "Build agent", steps: [
    { at: "claude-code", task: "Building client funnel", secs: 4 },
    { at: "qa", task: "Running tests", secs: 3 },
    { at: "web-builder", task: "Deploying to production", secs: 2 },
    { at: "ops", task: "Marking project delivered", secs: 2, count: "delivered" },
  ] },
];

export const COUNTERS = [
  { id: "leads", label: "Leads found" },
  { id: "qualified", label: "Qualified" },
  { id: "deals", label: "Deals won" },
  { id: "delivered", label: "Projects shipped" },
  { id: "reports", label: "Reports sent" },
  { id: "posts", label: "Posts queued" },
];

export const ALL_BUILDINGS = [HQ, ...BUILDINGS];
