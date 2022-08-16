/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { KubeObjectStore } from "../kube-object.store";

import { action, observable, makeObservable } from "mobx";
import { autoBind, isDefined, iter } from "../../utils";
import type { KubeApi } from "../kube-api";
import type { KubeJsonApiDataFor, KubeObject, ObjectReference } from "../kube-object";
import { parseKubeApi, createKubeApiURL } from "../kube-api-parse";

export type RegisterableStore<Store> = Store extends KubeObjectStore<any, any, any>
  ? Store
  : never;
export type RegisterableApi<Api> = Api extends KubeApi<any, any>
  ? Api
  : never;
export type KubeObjectStoreFrom<Api> = Api extends KubeApi<infer KubeObj, infer ApiData>
  ? KubeObjectStore<KubeObj, Api, ApiData>
  : never;

export class ApiManager {
  private readonly apis = observable.map<string, KubeApi>();
  private readonly stores = observable.map<string, KubeObjectStore>();

  constructor() {
    makeObservable(this);
    autoBind(this);
  }

  getApi(pathOrCallback: string | ((api: KubeApi<KubeObject>) => boolean)) {
    if (typeof pathOrCallback === "string") {
      console.log(this.apis.keys(), parseKubeApi(pathOrCallback).apiBase);

      return this.apis.get(pathOrCallback) || this.apis.get(parseKubeApi(pathOrCallback).apiBase);
    }

    return iter.find(this.apis.values(), pathOrCallback ?? (() => true));
  }

  getApiByKind(kind: string, apiVersion: string) {
    return iter.find(this.apis.values(), api => api.kind === kind && api.apiVersionWithGroup === apiVersion);
  }

  registerApi<Api>(api: RegisterableApi<Api>): void;
  /**
   * @deprecated Just register the `api` by itself
   */
  registerApi<Api>(apiBase: string, api: RegisterableApi<Api>): void;
  registerApi<Api>(apiBaseRaw: string | RegisterableApi<Api>, apiRaw?: RegisterableApi<Api>) {
    const api = typeof apiBaseRaw === "string"
      ? apiRaw
      : apiBaseRaw;

    if (!api?.apiBase) {
      return;
    }

    if (!this.apis.has(api.apiBase)) {
      this.stores.forEach((store) => {
        if (store.api === api) {
          this.stores.set(api.apiBase, store);
        }
      });

      this.apis.set(api.apiBase, api);
    }
  }

  protected resolveApi(api: undefined | string | KubeApi): KubeApi | undefined {
    if (!api) {
      return undefined;
    }

    if (typeof api === "string") {
      return this.getApi(api);
    }

    return api;
  }

  unregisterApi(api: string | KubeApi<KubeObject>) {
    if (typeof api === "string") this.apis.delete(api);
    else {
      const apis = Array.from(this.apis.entries());
      const entry = apis.find(entry => entry[1] === api);

      if (entry) this.unregisterApi(entry[0]);
    }
  }

  registerStore<KubeObj>(store: RegisterableStore<KubeObj>): void;
  /**
   * @deprecated KubeObjectStore's should only every be about a single KubeApi type
   */
  registerStore<KubeObj extends KubeObject>(store: KubeObjectStore<KubeObj, KubeApi<KubeObj>, KubeJsonApiDataFor<KubeObj>>, apis: KubeApi<KubeObj>[]): void;

  @action
  registerStore<KubeObj extends KubeObject>(store: KubeObjectStore<KubeObj, KubeApi<KubeObj>, KubeJsonApiDataFor<KubeObj>>, apis: KubeApi<KubeObj>[] = [store.api]): void {
    for (const api of apis.filter(isDefined)) {
      if (api.apiBase) {
        this.stores.set(api.apiBase, store as never);
      }
    }
  }

  getStore(api: string | undefined): KubeObjectStore | undefined;
  getStore<Api>(api: RegisterableApi<Api>): KubeObjectStoreFrom<Api> | undefined;
  /**
   * @deprecated use an actual cast instead of hiding it with this unused type param
   */
  getStore<Store extends KubeObjectStore>(api: string | KubeApi): Store | undefined ;
  getStore(api: string | KubeApi | undefined): KubeObjectStore | undefined {
    const { apiBase } = this.resolveApi(api) ?? {};

    if (apiBase) {
      return this.stores.get(apiBase);
    }

    return undefined;
  }

  lookupApiLink(ref: ObjectReference, parentObject?: KubeObject): string {
    const {
      kind, apiVersion = "v1", name,
      namespace = parentObject?.getNs(),
    } = ref;

    if (!kind) return "";

    // search in registered apis by 'kind' & 'apiVersion'
    const api = this.getApi(api => api.kind === kind && api.apiVersionWithGroup == apiVersion);

    if (api) {
      return api.getUrl({ namespace, name });
    }

    // lookup api by generated resource link
    const apiPrefixes = ["/apis", "/api"];
    const resource = kind.endsWith("s") ? `${kind.toLowerCase()}es` : `${kind.toLowerCase()}s`;

    for (const apiPrefix of apiPrefixes) {
      const apiLink = createKubeApiURL({ apiPrefix, apiVersion, name, namespace, resource });

      if (this.getApi(apiLink)) {
        return apiLink;
      }
    }

    // resolve by kind only (hpa's might use refs to older versions of resources for example)
    const apiByKind = this.getApi(api => api.kind === kind);

    if (apiByKind) {
      return apiByKind.getUrl({ name, namespace });
    }

    // otherwise generate link with default prefix
    // resource still might exists in k8s, but api is not registered in the app
    return createKubeApiURL({ apiVersion, name, namespace, resource });
  }
}
