/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import moment from "moment";

import type { DerivedKubeApiOptions } from "../kube-api";
import { KubeApi } from "../kube-api";
import type { PodSpec } from "./pod.api";
import type { KubeObjectStatus, LabelSelector, NamespaceScopedMetadata } from "../kube-object";
import { KubeObject } from "../kube-object";
import { hasTypedProperty, isNumber, isObject } from "../../utils";

export class DeploymentApi extends KubeApi<Deployment> {
  constructor(opts?: DerivedKubeApiOptions) {
    super({
      objectConstructor: Deployment,
      ...opts ?? {},
    });
  }

  protected getScaleApiUrl(params: { namespace: string; name: string }) {
    return `${this.getUrl(params)}/scale`;
  }

  async getReplicas(params: { namespace: string; name: string }): Promise<number> {
    const { status } = await this.request.get(this.getScaleApiUrl(params));

    if (isObject(status) && hasTypedProperty(status, "replicas", isNumber)) {
      return status.replicas;
    }

    return 0;
  }

  scale(params: { namespace: string; name: string }, replicas: number) {
    return this.request.patch(this.getScaleApiUrl(params), {
      data: {
        spec: {
          replicas,
        },
      },
    },
    {
      headers: {
        "content-type": "application/merge-patch+json",
      },
    });
  }

  restart(params: { namespace: string; name: string }) {
    return this.request.patch(this.getUrl(params), {
      data: {
        spec: {
          template: {
            metadata: {
              annotations: { "kubectl.kubernetes.io/restartedAt" : moment.utc().format() },
            },
          },
        },
      },
    },
    {
      headers: {
        "content-type": "application/strategic-merge-patch+json",
      },
    });
  }
}

export interface DeploymentSpec {
  replicas: number;
  selector: LabelSelector;
  template: {
    metadata: {
      creationTimestamp?: string;
      labels: Partial<Record<string, string>>;
      annotations?: Partial<Record<string, string>>;
    };
    spec: PodSpec;
  };
  strategy: {
    type: string;
    rollingUpdate: {
      maxUnavailable: number;
      maxSurge: number;
    };
  };
}

export interface DeploymentStatus extends KubeObjectStatus {
  observedGeneration: number;
  replicas: number;
  updatedReplicas: number;
  readyReplicas: number;
  availableReplicas?: number;
  unavailableReplicas?: number;
}

export class Deployment extends KubeObject<
  NamespaceScopedMetadata,
  DeploymentStatus,
  DeploymentSpec
> {
  static kind = "Deployment";
  static namespaced = true;
  static apiBase = "/apis/apps/v1/deployments";

  getSelectors(): string[] {
    return KubeObject.stringifyLabels(this.spec.selector.matchLabels);
  }

  getNodeSelectors(): string[] {
    return KubeObject.stringifyLabels(this.spec.template.spec.nodeSelector);
  }

  getTemplateLabels(): string[] {
    return KubeObject.stringifyLabels(this.spec.template.metadata.labels);
  }

  getTolerations() {
    return this.spec.template.spec.tolerations ?? [];
  }

  getAffinity() {
    return this.spec.template.spec.affinity;
  }

  getAffinityNumber() {
    return Object.keys(this.getAffinity() ?? {}).length;
  }

  getConditions(activeOnly = false) {
    const { conditions = [] } = this.status ?? {};

    if (activeOnly) {
      return conditions.filter(c => c.status === "True");
    }

    return conditions;
  }

  getConditionsText(activeOnly = true) {
    return this.getConditions(activeOnly)
      .map(({ type }) => type)
      .join(" ");
  }

  getReplicas() {
    return this.spec.replicas || 0;
  }
}
