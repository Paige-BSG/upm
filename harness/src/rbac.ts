import {
  CONTROL_NAMESPACE,
  SPEC_P1_AGENT_NO_PRIVILEGE,
  type Actor,
  type AgentCapabilities,
  type Permission,
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

export function writerAllowlist(sourceNs: string, restoreNs: string): Permission[] {
  return [
    { namespace: sourceNs, kind: "PerconaServerMySQL", verbs: ["get", "patch"] },
    { namespace: sourceNs, kind: "PerconaServerMySQLBackup", verbs: ["get", "create"] },
    { namespace: restoreNs, kind: "PerconaServerMySQL", verbs: ["get", "create"] },
    { namespace: restoreNs, kind: "PerconaServerMySQLRestore", verbs: ["get", "create"] },
    { namespace: CONTROL_NAMESPACE, kind: "ConfigMap", verbs: ["get", "create", "list"] },
    { namespace: CONTROL_NAMESPACE, kind: "Lease", verbs: ["get", "create", "update"] },
  ];
}

function permissionTuples(rules: readonly Permission[]): string[] {
  return rules
    .flatMap((rule) => rule.verbs.map((verb) => `${rule.namespace}/${rule.kind}:${verb}`))
    .sort();
}

export function writerMustAllow(actor: Actor, sourceNs: string, restoreNs: string): boolean {
  const required = permissionTuples(writerAllowlist(sourceNs, restoreNs));
  const actual = permissionTuples(actor.rules);
  return required.length === actual.length && required.every((item, index) => item === actual[index]);
}
