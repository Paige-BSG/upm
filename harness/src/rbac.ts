import {
  CONTROL_KINDS,
  SPEC_P1_AGENT_NO_PRIVILEGE,
  type Actor,
  type AgentCapabilities,
  type ControlKind,
  type PerconaKind,
  type ResourceKind,
} from "./types.ts";

void SPEC_P1_AGENT_NO_PRIVILEGE;

export function agentHasPrivilege(agent: AgentCapabilities): boolean {
  return agent.bash || agent.kubectl || agent.kubeconfig || agent.dbAdmin;
}

export function actorMay(actor: Actor, namespace: string, kind: ResourceKind): boolean {
  if ((CONTROL_KINDS as readonly string[]).includes(kind)) {
    return actor.namespaces.includes(namespace) && actor.controlKinds.includes(kind as ControlKind);
  }
  return actor.namespaces.includes(namespace) && actor.kinds.includes(kind as PerconaKind);
}
