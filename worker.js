const RUNS_KEY = "history";
const MAX_RUNS = 50;

async function getRuns(env) {
  return (await env.RUNS.get(RUNS_KEY, "json")) || [];
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/runs" && request.method === "GET") {
      const runs = await getRuns(env);
      return Response.json(runs);
    }

    if (pathname === "/api/runs" && request.method === "POST") {
      if (request.headers.get("Authorization") !== `Bearer ${env.RUN_TOKEN}`) {
        return new Response("unauthorized", { status: 401 });
      }
      const body = await request.json();
      const run = {
        at: new Date().toISOString(),
        mode: body.mode === "apply" ? "apply" : "dry-run",
        filed: body.filed | 0,
        fixed: body.fixed | 0,
        unsubscribed: body.unsubscribed | 0,
        archived: body.archived | 0,
      };
      const runs = [run, ...(await getRuns(env))].slice(0, MAX_RUNS);
      await env.RUNS.put(RUNS_KEY, JSON.stringify(runs));
      return Response.json(run, { status: 201 });
    }

    return env.ASSETS.fetch(request);
  },
};
