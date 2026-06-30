console.log("[actor-bootstrap] Node a démarré le point d'entrée Apify");

try {
  const { runActor } = await import("./actor.js");
  console.log("[actor-bootstrap] Module principal chargé");
  await runActor();
} catch (err) {
  const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ""}` : String(err);
  console.error("[actor-bootstrap] Échec avant ou pendant le lancement de l'Actor:", message);
  process.exitCode = 1;
}
