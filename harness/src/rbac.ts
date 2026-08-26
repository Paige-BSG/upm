import { PERCONA_KINDS, type AdapterActor, type AgentCapabilities, type PerconaKind } from "./types.ts";

export function agentHasPrivilege(agent: AgentCapabilities): boolean {
  return agent.bash || agent.kubectl || agent.kubeconfig || agent.dbAdmin;
}

export function actorMay(
  actor: AdapterActor,
  namespace: string,
  kind: PerconaKind,
): boolean {
  return actor.namespaces.includes(namespace) && actor.kinds.includes(kind);
}

export function narrowPerconaActor(namespaces: readonly string[]): AdapterActor {
  return {
    namespaces,
    kinds: PERCONA_KINDS,
  };
}
