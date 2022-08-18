/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DerivedKubeApiOptions, IgnoredKubeApiOptions } from "../kube-api";
import { KubeApi } from "../kube-api";
import type { LabelSelector, NamespaceScopedMetadata } from "../kube-object";
import { KubeObject } from "../kube-object";
import type { PodTemplateSpec } from "./types/pod-template-spec";
import type { PersistentVolumeClaimTemplateSpec } from "./types/persistent-volume-claim-template-spec";

export class StatefulSetApi extends KubeApi<StatefulSet> {
  constructor(opts: DerivedKubeApiOptions & IgnoredKubeApiOptions = {}) {
    super({
      ...opts,
      objectConstructor: StatefulSet,
    });
  }

  protected getScaleApiUrl(params: { namespace: string; name: string }) {
    return `${this.getUrl(params)}/scale`;
  }

  getReplicas(params: { namespace: string; name: string }): Promise<number> {
    return this.request
      .get(this.getScaleApiUrl(params))
      .then(({ status }: any) => status?.replicas);
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
}

export interface StatefulSetSpec {
  serviceName: string;
  replicas: number;
  selector: LabelSelector;
  template: PodTemplateSpec;
  volumeClaimTemplates: PersistentVolumeClaimTemplateSpec[];
}

export interface StatefulSetStatus {
  observedGeneration: number;
  replicas: number;
  currentReplicas: number;
  readyReplicas: number;
  currentRevision: string;
  updateRevision: string;
  collisionCount: number;
}

export class StatefulSet extends KubeObject<
  NamespaceScopedMetadata,
  StatefulSetStatus,
  StatefulSetSpec
> {
  static readonly kind = "StatefulSet";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/apps/v1/statefulsets";

  getSelectors(): string[] {
    return KubeObject.stringifyLabels(this.spec.selector.matchLabels);
  }

  getNodeSelectors(): string[] {
    return KubeObject.stringifyLabels(this.spec.template.spec?.nodeSelector);
  }

  getTemplateLabels(): string[] {
    return KubeObject.stringifyLabels(this.spec.template.metadata?.labels);
  }

  getTolerations() {
    return this.spec.template.spec?.tolerations ?? [];
  }

  getAffinity() {
    return this.spec.template.spec?.affinity ?? {};
  }

  getAffinityNumber() {
    return Object.keys(this.getAffinity()).length;
  }

  getReplicas() {
    return this.spec.replicas || 0;
  }

  getImages() {
    const containers = this.spec.template?.spec?.containers ?? [];

    return containers.map(container => container.image);
  }
}
