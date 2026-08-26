import {
  CONTROL_NAMESPACE,
  SPEC_P1_AGENT_NO_PRIVILEGE,
  type Actor,
  type AgentCapabilities,
  type ResourceKind,
  type Verb,
} from "./types.ts";

void SPEC_P1_AGENT_NO_PRIVILEGE;

export function agentHasPrivilege(agent: AgentCapabilities): boolean {
  return agent.bash || agent.kubectl || agent.kubeconfig || agent.dbAdmin;
}

export function actorMay(actor: Actor, namespace: string, kind: ResourceKind, verb: Verb): boolean {
  return actor.rules.some(
    (rule) => rule.namespace === namespace && rule.kind === kind && rule.verbs.includes(verb),
  );
}

export function writerMustAllow(actor: Actor, sourceNs: string, restoreNs: string): boolean {
  const required: readonly [string, ResourceKind, Verb][] = [
    [sourceNs, "PerconaServerMySQL", "get"],
    [sourceNs, "PerconaServerMySQL", "patch"],
    [sourceNs, "PerconaServerMySQLBackup", "get"],
    [sourceNs, "PerconaServerMySQLBackup", "create"],
    [restoreNs, "PerconaServerMySQL", "get"],
    [restoreNs, "PerconaServerMySQL", "create"],
    [restoreNs, "PerconaServerMySQLRestore", "get"],
    [restoreNs, "PerconaServerMySQLRestore", "create"],
    [CONTROL_NAMESPACE, "ConfigMap", "get"],
    [CONTROL_NAMESPACE, "ConfigMap", "create"],
    [CONTROL_NAMESPACE, "ConfigMap", "list"],
    [CONTROL_NAMESPACE, "Lease", "get"],
    [CONTROL_NAMESPACE, "Lease", "create"],
    [CONTROL_NAMESPACE, "Lease", "update"],
  ];
  return required.every(([namespace, kind, verb]) => actorMay(actor, namespace, kind, verb));
}
