import { SPEC_P1_AGENT_NO_PRIVILEGE, type Actor, type AgentCapabilities, type PerconaKind } from "./types.ts";

void SPEC_P1_AGENT_NO_PRIVILEGE;

export function agentHasPrivilege(agent: AgentCapabilities): boolean {
  return agent.bash || agent.kubectl || agent.kubeconfig || agent.dbAdmin;
}

export function actorMay(actor: Actor, namespace: string, kind: PerconaKind): boolean {
  return actor.namespaces.includes(namespace) && actor.kinds.includes(kind);
}
