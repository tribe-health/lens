/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { KubeApiWatchCallback } from "../kube-api";
import { KubeApi } from "../kube-api";
import type { KubeJsonApi, KubeJsonApiData } from "../kube-json-api";
import { PassThrough } from "stream";
import type { ApiManager } from "../api-manager";
import { Deployment, DeploymentApi, Ingress, IngressApi, NamespaceApi, Pod, PodApi } from "../endpoints";
import { getDiForUnitTesting } from "../../../renderer/getDiForUnitTesting";
import apiManagerInjectable from "../api-manager/manager.injectable";
import autoRegistrationInjectable from "../api-manager/auto-registration.injectable";
import type { Fetch } from "../../fetch/fetch.injectable";
import fetchInjectable from "../../fetch/fetch.injectable";
import type { CreateKubeApiForRemoteCluster } from "../create-kube-api-for-remote-cluster.injectable";
import createKubeApiForRemoteClusterInjectable from "../create-kube-api-for-remote-cluster.injectable";
import { Response } from "node-fetch";
import type { AsyncFnMock } from "@async-fn/jest";
import asyncFn from "@async-fn/jest";
import { flushPromises } from "../../test-utils/flush-promises";
import createKubeJsonApiInjectable from "../create-kube-json-api.injectable";
import type { IKubeWatchEvent } from "../kube-watch-event";
import type { KubeJsonApiDataFor } from "../kube-object";

describe("createKubeApiForRemoteCluster", () => {
  let createKubeApiForRemoteCluster: CreateKubeApiForRemoteCluster;
  let fetchMock: AsyncFnMock<Fetch>;

  beforeEach(() => {
    const di = getDiForUnitTesting({ doGeneralOverrides: true });

    fetchMock = asyncFn();
    di.override(fetchInjectable, () => fetchMock);

    createKubeApiForRemoteCluster = di.inject(createKubeApiForRemoteClusterInjectable);
  });

  it("builds api client for KubeObject", async () => {
    const api = createKubeApiForRemoteCluster({
      cluster: {
        server: "https://127.0.0.1:6443",
      },
      user: {
        token: "daa",
      },
    }, Pod);

    expect(api).toBeInstanceOf(KubeApi);
  });

  describe("when building for remote cluster with specific constructor", () => {
    let api: PodApi;

    beforeEach(() => {
      api = createKubeApiForRemoteCluster({
        cluster: {
          server: "https://127.0.0.1:6443",
        },
        user: {
          token: "daa",
        },
      }, Pod, PodApi);
    });

    it("uses the constructor", () => {
      expect(api).toBeInstanceOf(PodApi);
    });

    describe("when calling list without namespace", () => {
      let listRequest: Promise<Pod[] | null>;

      beforeEach(async () => {
        listRequest = api.list();

        // This is required because of how JS promises work
        await flushPromises();
      });

      it("should request pods from default namespace", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "https://127.0.0.1:6443/api/v1/namespaces/default/pods",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "get",
          },
        ]);
      });

      describe("when request resolves with data", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ["https://127.0.0.1:6443/api/v1/namespaces/default/pods"],
            new Response(JSON.stringify({
              kind: "PodList",
              apiVersion: "v1",
              metadata:{
                resourceVersion: "452899",
              },
              items: [],
            })),
          );
        });

        it("resolves the list call", async () => {
          expect(await listRequest).toEqual([]);
        });
      });
    });
  });
});

describe("KubeApi", () => {
  let request: KubeJsonApi;
  let registerApiSpy: jest.SpiedFunction<ApiManager["registerApi"]>;
  let fetchMock: AsyncFnMock<Fetch>;

  beforeEach(() => {
    const di = getDiForUnitTesting({ doGeneralOverrides: true });

    fetchMock = asyncFn();
    di.override(fetchInjectable, () => fetchMock);

    const createKubeJsonApi = di.inject(createKubeJsonApiInjectable);

    request = createKubeJsonApi({
      serverAddress: `http://127.0.0.1:9999`,
      apiBase: "/api-kube",
    });
    registerApiSpy = jest.spyOn(di.inject(apiManagerInjectable), "registerApi");

    di.inject(autoRegistrationInjectable);
  });

  describe("on first call to IngressApi.get()", () => {
    let ingressApi: IngressApi;
    let getCall: Promise<Ingress | null>;

    beforeEach(async () => {
      ingressApi = new IngressApi({
        request,
        objectConstructor: Ingress,
        apiBase: "/apis/networking.k8s.io/v1/ingresses",
        fallbackApiBases: ["/apis/extensions/v1beta1/ingresses"],
        checkPreferredVersion: true,
      });
      getCall = ingressApi.get({
        name: "foo",
        namespace: "default",
      });

      // This is needed because of how JS promises work
      await flushPromises();
    });

    it("requests resources from the versioned api group from the initial apiBase", () => {
      expect(fetchMock.mock.lastCall).toMatchObject([
        "http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1",
        {
          headers: {
            "content-type": "application/json",
          },
          method: "get",
        },
      ]);
    });

    describe("when resource request fufills with a resource", () => {
      beforeEach(async () => {
        await fetchMock.resolveSpecific(
          ["http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1"],
          new Response(JSON.stringify({
            resources: [{
              name: "ingresses",
            }],
          })),
        );
      });

      it("requests the perferred version of that api group", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/apis/networking.k8s.io",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "get",
          },
        ]);
      });

      describe("when the preferred version resolves with v1", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/apis/networking.k8s.io"],
            new Response(JSON.stringify({
              preferredVersion: {
                version: "v1",
              },
            })),
          );
        });

        it("makes the request to get the resource", () => {
          expect(fetchMock.mock.lastCall).toMatchObject([
            "http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1/namespaces/default/ingresses/foo",
            {
              headers: {
                "content-type": "application/json",
              },
              method: "get",
            },
          ]);
        });

        it("sets fields in the api instance", () => {
          expect(ingressApi.apiVersionPreferred).toBe("v1");
          expect(ingressApi.apiPrefix).toBe("/apis");
          expect(ingressApi.apiGroup).toBe("networking.k8s.io");
        });

        it("registers the api with the changes info", () => {
          expect(registerApiSpy).toBeCalledWith(ingressApi);
        });

        describe("when the request resolves with no data", () => {
          let result: Ingress | null;

          beforeEach(async () => {
            await fetchMock.resolveSpecific(
              ["http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1/namespaces/default/ingresses/foo"],
              new Response(JSON.stringify({})),
            );
            result = await getCall;
          });

          it("results in the get call resolving to null", () => {
            expect(result).toBeNull();
          });

          describe("on the second call to IngressApi.get()", () => {
            let getCall: Promise<Ingress | null>;

            beforeEach(async () => {
              getCall = ingressApi.get({
                name: "foo1",
                namespace: "default",
              });

              // This is needed because of how JS promises work
              await flushPromises();
            });

            it("makes the request to get the resource", () => {
              expect(fetchMock.mock.lastCall).toMatchObject([
                "http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1/namespaces/default/ingresses/foo1",
                {
                  headers: {
                    "content-type": "application/json",
                  },
                  method: "get",
                },
              ]);
            });

            describe("when the request resolves with no data", () => {
              let result: Ingress | null;

              beforeEach(async () => {
                await fetchMock.resolveSpecific(
                  ["http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1/namespaces/default/ingresses/foo1"],
                  new Response(JSON.stringify({})),
                );
                result = await getCall;
              });

              it("results in the get call resolving to null", () => {
                expect(result).toBeNull();
              });
            });
          });
        });

        describe("when the request resolves with data", () => {
          let result: Ingress | null;

          beforeEach(async () => {
            await fetchMock.resolveSpecific(
              ["http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1/namespaces/default/ingresses/foo"],
              new Response(JSON.stringify({
                apiVersion: "v1",
                kind: "Ingress",
                metadata: {
                  name: "foo",
                  namespace: "default",
                  resourceVersion: "1",
                  uid: "12345",
                },
              })),
            );
            result = await getCall;
          });

          it("results in the get call resolving to an instance", () => {
            expect(result).toBeInstanceOf(Ingress);
          });

          describe("on the second call to IngressApi.get()", () => {
            let getCall: Promise<Ingress | null>;

            beforeEach(async () => {
              getCall = ingressApi.get({
                name: "foo1",
                namespace: "default",
              });

              // This is needed because of how JS promises work
              await flushPromises();
            });

            it("makes the request to get the resource", () => {
              expect(fetchMock.mock.lastCall).toMatchObject([
                "http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1/namespaces/default/ingresses/foo1",
                {
                  headers: {
                    "content-type": "application/json",
                  },
                  method: "get",
                },
              ]);
            });

            describe("when the request resolves with no data", () => {
              let result: Ingress | null;

              beforeEach(async () => {
                await fetchMock.resolveSpecific(
                  ["http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1/namespaces/default/ingresses/foo1"],
                  new Response(JSON.stringify({})),
                );
                result = await getCall;
              });

              it("results in the get call resolving to null", () => {
                expect(result).toBeNull();
              });
            });
          });
        });
      });
    });

    describe("when resource request fufills with no resource", () => {
      beforeEach(async () => {
        await fetchMock.resolveSpecific(
          ["http://127.0.0.1:9999/api-kube/apis/networking.k8s.io/v1"],
          new Response(JSON.stringify({
            resources: [],
          })),
        );
      });

      it("requests the resources from the base api url from the fallback api", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "get",
          },
        ]);
      });

      describe("when resource request fufills with a resource", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1"],
            new Response(JSON.stringify({
              resources: [{
                name: "ingresses",
              }],
            })),
          );
        });

        it("requests the preferred version for that api group", () => {
          expect(fetchMock.mock.lastCall).toMatchObject([
            "http://127.0.0.1:9999/api-kube/apis/extensions",
            {
              headers: {
                "content-type": "application/json",
              },
              method: "get",
            },
          ]);
        });

        describe("when the preferred version request resolves to v1beta1", () => {
          beforeEach(async () => {
            await fetchMock.resolveSpecific(
              ["http://127.0.0.1:9999/api-kube/apis/extensions"],
              new Response(JSON.stringify({
                preferredVersion: {
                  version: "v1beta1",
                },
              })),
            );
          });

          it("makes the request to get the resource", () => {
            expect(fetchMock.mock.lastCall).toMatchObject([
              "http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1/namespaces/default/ingresses/foo",
              {
                headers: {
                  "content-type": "application/json",
                },
                method: "get",
              },
            ]);
          });

          it("sets fields in the api instance", () => {
            expect(ingressApi.apiVersionPreferred).toBe("v1beta1");
            expect(ingressApi.apiPrefix).toBe("/apis");
            expect(ingressApi.apiGroup).toBe("extensions");
          });

          it("registers the api with the changes info", () => {
            expect(registerApiSpy).toBeCalledWith(ingressApi);
          });

          describe("when the request resolves with no data", () => {
            let result: Ingress | null;

            beforeEach(async () => {
              await fetchMock.resolveSpecific(
                ["http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1/namespaces/default/ingresses/foo"],
                new Response(JSON.stringify({})),
              );
              result = await getCall;
            });

            it("results in the get call resolving to null", () => {
              expect(result).toBeNull();
            });

            describe("on the second call to IngressApi.get()", () => {
              let getCall: Promise<Ingress | null>;

              beforeEach(async () => {
                getCall = ingressApi.get({
                  name: "foo1",
                  namespace: "default",
                });

                // This is needed because of how JS promises work
                await flushPromises();
              });

              it("makes the request to get the resource", () => {
                expect(fetchMock.mock.lastCall).toMatchObject([
                  "http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1/namespaces/default/ingresses/foo1",
                  {
                    headers: {
                      "content-type": "application/json",
                    },
                    method: "get",
                  },
                ]);
              });

              describe("when the request resolves with no data", () => {
                let result: Ingress | null;

                beforeEach(async () => {
                  await fetchMock.resolveSpecific(
                    ["http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1/namespaces/default/ingresses/foo1"],
                    new Response(JSON.stringify({})),
                  );
                  result = await getCall;
                });

                it("results in the get call resolving to null", () => {
                  expect(result).toBeNull();
                });
              });
            });
          });

          describe("when the request resolves with data", () => {
            let result: Ingress | null;

            beforeEach(async () => {
              await fetchMock.resolveSpecific(
                ["http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1/namespaces/default/ingresses/foo"],
                new Response(JSON.stringify({
                  apiVersion: "v1beta1",
                  kind: "Ingress",
                  metadata: {
                    name: "foo",
                    namespace: "default",
                    resourceVersion: "1",
                    uid: "12345",
                  },
                })),
              );
              result = await getCall;
            });

            it("results in the get call resolving to an instance", () => {
              expect(result).toBeInstanceOf(Ingress);
            });

            describe("on the second call to IngressApi.get()", () => {
              let getCall: Promise<Ingress | null>;

              beforeEach(async () => {
                getCall = ingressApi.get({
                  name: "foo1",
                  namespace: "default",
                });

                // This is needed because of how JS promises work
                await flushPromises();
              });

              it("makes the request to get the resource", () => {
                expect(fetchMock.mock.lastCall).toMatchObject([
                  "http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1/namespaces/default/ingresses/foo1",
                  {
                    headers: {
                      "content-type": "application/json",
                    },
                    method: "get",
                  },
                ]);
              });

              describe("when the request resolves with no data", () => {
                let result: Ingress | null;

                beforeEach(async () => {
                  await fetchMock.resolveSpecific(
                    ["http://127.0.0.1:9999/api-kube/apis/extensions/v1beta1/namespaces/default/ingresses/foo1"],
                    new Response(JSON.stringify({})),
                  );
                  result = await getCall;
                });

                it("results in the get call resolving to null", () => {
                  expect(result).toBeNull();
                });
              });
            });
          });
        });
      });
    });
  });

  describe("patching deployments", () => {
    let api: DeploymentApi;

    beforeEach(() => {
      api = new DeploymentApi({
        request,
      });
    });

    describe("when patching a resource without providing a strategy", () => {
      let patchRequest: Promise<Deployment | null>;

      beforeEach(async () => {
        patchRequest = api.patch({ name: "test", namespace: "default" }, {
          spec: { replicas: 2 },
        });

        // This is needed because of how JS promises work
        await flushPromises();
      });

      it("requests a patch using strategic merge", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/apis/apps/v1/namespaces/default/deployments/test",
          {
            headers: {
              "content-type": "application/strategic-merge-patch+json",
            },
            method: "patch",
            body: JSON.stringify({ spec: { replicas: 2 }}),
          },
        ]);
      });

      describe("when the patch request resolves with data", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/apis/apps/v1/namespaces/default/deployments/test"],
            new Response(JSON.stringify({
              apiVersion: "v1",
              kind: "Deployment",
              metadata: {
                name: "test",
                namespace: "default",
                resourceVersion: "1",
                uid: "12345",
              },
              spec: {
                replicas: 2,
              },
            })),
          );
        });

        it("resolves the patch call", async () => {
          expect(await patchRequest).toBeInstanceOf(Deployment);
        });
      });
    });

    describe("when patching a resource using json patch", () => {
      let patchRequest: Promise<Deployment | null>;

      beforeEach(async () => {
        patchRequest = api.patch({ name: "test", namespace: "default" }, [
          { op: "replace", path: "/spec/replicas", value: 2 },
        ], "json");

        // This is needed because of how JS promises work
        await flushPromises();
      });

      it("requests a patch using json merge", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/apis/apps/v1/namespaces/default/deployments/test",
          {
            headers: {
              "content-type": "application/json-patch+json",
            },
            method: "patch",
            body: JSON.stringify([
              { op: "replace", path: "/spec/replicas", value: 2 },
            ]),
          },
        ]);
      });

      describe("when the patch request resolves with data", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/apis/apps/v1/namespaces/default/deployments/test"],
            new Response(JSON.stringify({
              apiVersion: "v1",
              kind: "Deployment",
              metadata: {
                name: "test",
                namespace: "default",
                resourceVersion: "1",
                uid: "12345",
              },
              spec: {
                replicas: 2,
              },
            })),
          );
        });

        it("resolves the patch call", async () => {
          expect(await patchRequest).toBeInstanceOf(Deployment);
        });
      });
    });

    describe("when patching a resource using merge patch", () => {
      let patchRequest: Promise<Deployment | null>;

      beforeEach(async () => {
        patchRequest = api.patch(
          { name: "test", namespace: "default" },
          { metadata: { annotations: { provisioned: "True" }}},
          "merge",
        );

        // This is needed because of how JS promises work
        await flushPromises();
      });

      it("requests a patch using json merge", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/apis/apps/v1/namespaces/default/deployments/test",
          {
            headers: {
              "content-type": "application/merge-patch+json",
            },
            method: "patch",
            body: JSON.stringify({ metadata: { annotations: { provisioned: "True" }}}),
          },
        ]);
      });

      describe("when the patch request resolves with data", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/apis/apps/v1/namespaces/default/deployments/test"],
            new Response(JSON.stringify({
              apiVersion: "v1",
              kind: "Deployment",
              metadata: {
                name: "test",
                namespace: "default",
                resourceVersion: "1",
                uid: "12345",
                annotations: {
                  provisioned: "True",
                },
              },
            })),
          );
        });

        it("resolves the patch call", async () => {
          expect(await patchRequest).toBeInstanceOf(Deployment);
        });
      });
    });
  });

  describe("deleting pods (namespace scoped resource)", () => {
    let api: PodApi;

    beforeEach(() => {
      api = new PodApi({
        request,
      });
    });

    describe("when deleting by just name", () => {
      let deleteRequest: Promise<KubeJsonApiData>;

      beforeEach(async () => {
        deleteRequest = api.delete({ name: "foo" });

        // This is required for how JS promises work
        await flushPromises();
      });

      it("requests deleting pod in default namespace", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods/foo?propagationPolicy=Background",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "delete",
          },
        ]);
      });

      describe("when request resolves", () => {
        beforeEach(async () => {
          fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods/foo?propagationPolicy=Background"],
            new Response("{}"),
          );
        });

        it("resolves the call", async () => {
          expect(await deleteRequest).toBeDefined();
        });
      });
    });

    describe("when deleting by name and empty namespace", () => {
      let deleteRequest: Promise<KubeJsonApiData>;

      beforeEach(async () => {
        deleteRequest = api.delete({ name: "foo", namespace: "" });

        // This is required for how JS promises work
        await flushPromises();
      });

      it("requests deleting pod in default namespace", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods/foo?propagationPolicy=Background",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "delete",
          },
        ]);
      });

      describe("when request resolves", () => {
        beforeEach(async () => {
          fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods/foo?propagationPolicy=Background"],
            new Response("{}"),
          );
        });

        it("resolves the call", async () => {
          expect(await deleteRequest).toBeDefined();
        });
      });
    });

    describe("when deleting by name and namespace", () => {
      let deleteRequest: Promise<KubeJsonApiData>;

      beforeEach(async () => {
        deleteRequest = api.delete({ name: "foo", namespace: "test" });

        // This is required for how JS promises work
        await flushPromises();
      });

      it("requests deleting pod in given namespace", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/test/pods/foo?propagationPolicy=Background",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "delete",
          },
        ]);
      });

      describe("when request resolves", () => {
        beforeEach(async () => {
          fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/api/v1/namespaces/test/pods/foo?propagationPolicy=Background"],
            new Response("{}"),
          );
        });

        it("resolves the call", async () => {
          expect(await deleteRequest).toBeDefined();
        });
      });
    });
  });

  describe("deleting namespaces (cluser scoped resource)", () => {
    let api: NamespaceApi;

    beforeEach(() => {
      api = new NamespaceApi({
        request,
      });
    });

    describe("when deleting by just name", () => {
      let deleteRequest: Promise<KubeJsonApiData>;

      beforeEach(async () => {
        deleteRequest = api.delete({ name: "foo" });

        // This is required for how JS promises work
        await flushPromises();
      });

      it("requests deleting Namespace without namespace", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/foo?propagationPolicy=Background",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "delete",
          },
        ]);
      });

      describe("when request resolves", () => {
        beforeEach(async () => {
          fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/api/v1/namespaces/foo?propagationPolicy=Background"],
            new Response("{}"),
          );
        });

        it("resolves the call", async () => {
          expect(await deleteRequest).toBeDefined();
        });
      });
    });

    describe("when deleting by name and empty namespace", () => {
      let deleteRequest: Promise<KubeJsonApiData>;

      beforeEach(async () => {
        deleteRequest = api.delete({ name: "foo", namespace: "" });

        // This is required for how JS promises work
        await flushPromises();
      });

      it("requests deleting Namespace without namespace", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/foo?propagationPolicy=Background",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "delete",
          },
        ]);
      });

      describe("when request resolves", () => {
        beforeEach(async () => {
          fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/api/v1/namespaces/foo?propagationPolicy=Background"],
            new Response("{}"),
          );
        });

        it("resolves the call", async () => {
          expect(await deleteRequest).toBeDefined();
        });
      });
    });

    describe("when deleting by name and namespace", () => {
      it("rejects request", () => {
        expect(api.delete({ name: "foo", namespace: "test" })).rejects.toBeDefined();
      });
    });
  });

  describe("watching pods", () => {
    let api: PodApi;
    let stream: PassThrough;

    beforeEach(() => {
      api = new PodApi({
        request,
      });
      stream = new PassThrough();
    });

    afterEach(() => {
      stream.end();
      stream.destroy();
    });

    describe("when watching in a namespace", () => {
      let stopWatch: () => void;
      let callback: jest.MockedFunction<KubeApiWatchCallback>;

      beforeEach(async () => {
        callback = jest.fn();
        stopWatch = api.watch({
          namespace: "kube-system",
          callback,
        });

        await flushPromises();
      });

      it("requests the watch", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/kube-system/pods?watch=1&resourceVersion=",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "get",
          },
        ]);
      });

      describe("when the request resolves with a stream", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ([url, init]) => {
              const isMatch = url === "http://127.0.0.1:9999/api-kube/api/v1/namespaces/kube-system/pods?watch=1&resourceVersion=";

              if (isMatch) {
                init?.signal?.addEventListener("abort", () => {
                  stream.destroy();
                });
              }

              return isMatch;
            },
            new Response(stream),
          );
        });

        describe("when some data comes back on the stream", () => {
          beforeEach(() => {
            stream.emit("data", `${JSON.stringify({
              type: "ADDED",
              object: {
                apiVersion: "v1",
                kind: "Pod",
                metadata: {
                  name: "foobar",
                  namespace: "kube-system",
                  resourceVersion: "1",
                  uid: "123456",
                },
              },
            } as IKubeWatchEvent<KubeJsonApiDataFor<Pod>>)}\n`);
          });

          it("calls the callback with the data", () => {
            expect(callback).toBeCalledWith(
              {
                type: "ADDED",
                object: {
                  apiVersion: "v1",
                  kind: "Pod",
                  metadata: {
                    name: "foobar",
                    namespace: "kube-system",
                    resourceVersion: "1",
                    selfLink: "/api/v1/namespaces/kube-system/pods/foobar",
                    uid: "123456",
                  },
                },
              },
              null,
            );
          });

          describe("when stopping the watch", () => {
            beforeEach(() => {
              stopWatch();
            });

            it("closes the stream", () => {
              expect(stream.destroyed).toBe(true);
            });
          });
        });
      });
    });

    describe("when watching in a namespace with an abort controller provided", () => {
      let callback: jest.MockedFunction<KubeApiWatchCallback>;
      let abortController: AbortController;

      beforeEach(async () => {
        callback = jest.fn();
        abortController = new AbortController();
        api.watch({
          namespace: "kube-system",
          callback,
          abortController,
        });

        await flushPromises();
      });

      it("requests the watch", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/kube-system/pods?watch=1&resourceVersion=",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "get",
          },
        ]);
      });

      describe("when the request resolves with a stream", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ([url, init]) => {
              const isMatch = url === "http://127.0.0.1:9999/api-kube/api/v1/namespaces/kube-system/pods?watch=1&resourceVersion=";

              if (isMatch) {
                init?.signal?.addEventListener("abort", () => {
                  stream.destroy();
                });
              }

              return isMatch;
            },
            new Response(stream),
          );
        });

        describe("when some data comes back on the stream", () => {
          beforeEach(() => {
            stream.emit("data", `${JSON.stringify({
              type: "ADDED",
              object: {
                apiVersion: "v1",
                kind: "Pod",
                metadata: {
                  name: "foobar",
                  namespace: "kube-system",
                  resourceVersion: "1",
                  uid: "123456",
                },
              },
            } as IKubeWatchEvent<KubeJsonApiDataFor<Pod>>)}\n`);
          });

          it("calls the callback with the data", () => {
            expect(callback).toBeCalledWith(
              {
                type: "ADDED",
                object: {
                  apiVersion: "v1",
                  kind: "Pod",
                  metadata: {
                    name: "foobar",
                    namespace: "kube-system",
                    resourceVersion: "1",
                    selfLink: "/api/v1/namespaces/kube-system/pods/foobar",
                    uid: "123456",
                  },
                },
              },
              null,
            );
          });

          describe("when stopping the watch via the controller", () => {
            beforeEach(() => {
              abortController.abort();
            });

            it("closes the stream", () => {
              expect(stream.destroyed).toBe(true);
            });
          });
        });
      });
    });

    describe("when watching in a namespace with a timeout", () => {
      let stopWatch: () => void;
      let callback: jest.MockedFunction<KubeApiWatchCallback>;

      beforeEach(async () => {
        callback = jest.fn();
        stopWatch = api.watch({
          namespace: "kube-system",
          callback,
          timeout: 60,
        });

        await flushPromises();
      });

      it("requests the watch", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/kube-system/pods?watch=1&resourceVersion=&timeoutSeconds=60",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "get",
          },
        ]);
      });

      describe("when the request resolves with a stream", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ([url, init]) => {
              const isMatch = url === "http://127.0.0.1:9999/api-kube/api/v1/namespaces/kube-system/pods?watch=1&resourceVersion=&timeoutSeconds=60";

              if (isMatch) {
                init?.signal?.addEventListener("abort", () => {
                  stream.destroy();
                });
              }

              return isMatch;
            },
            new Response(stream),
          );
        });

        describe("when some data comes back on the stream", () => {
          beforeEach(() => {
            stream.emit("data", `${JSON.stringify({
              type: "ADDED",
              object: {
                apiVersion: "v1",
                kind: "Pod",
                metadata: {
                  name: "foobar",
                  namespace: "kube-system",
                  resourceVersion: "1",
                  uid: "123456",
                },
              },
            } as IKubeWatchEvent<KubeJsonApiDataFor<Pod>>)}\n`);
          });

          it("calls the callback with the data", () => {
            expect(callback).toBeCalledWith(
              {
                type: "ADDED",
                object: {
                  apiVersion: "v1",
                  kind: "Pod",
                  metadata: {
                    name: "foobar",
                    namespace: "kube-system",
                    resourceVersion: "1",
                    selfLink: "/api/v1/namespaces/kube-system/pods/foobar",
                    uid: "123456",
                  },
                },
              },
              null,
            );
          });

          describe("when stopping the watch", () => {
            beforeEach(() => {
              stopWatch();
            });

            it("closes the stream", () => {
              expect(stream.destroyed).toBe(true);
            });
          });

          describe("when the watch ends", () => {
            beforeEach(() => {
              stream.end();
            });

            it("requests a new watch", () => {
              expect(fetchMock.mock.lastCall).toMatchObject([
                "http://127.0.0.1:9999/api-kube/api/v1/namespaces/kube-system/pods?watch=1&resourceVersion=&timeoutSeconds=60",
                {
                  headers: {
                    "content-type": "application/json",
                  },
                  method: "get",
                },
              ]);
            });

            describe("when stopping the watch", () => {
              beforeEach(() => {
                stopWatch();
              });

              it("closes the stream", () => {
                expect(stream.destroyed).toBe(true);
              });
            });
          });
        });
      });
    });
  });

  describe("creating pods", () => {
    let api: PodApi;

    beforeEach(() => {
      api = new PodApi({
        request,
      });
    });

    describe("when creating a pod", () => {
      let createRequest: Promise<Pod | null>;

      beforeEach(async () => {
        createRequest = api.create({
          name: "foobar",
          namespace: "default",
        }, {
          metadata: {
            labels: {
              foo: "bar",
            },
          },
          spec: {
            containers: [
              {
                name: "web",
                image: "nginx",
                ports: [
                  {
                    name: "web",
                    containerPort: 80,
                    protocol: "TCP",
                  },
                ],
              },
            ],
          },
        });

        // This is required because of how JS promises work
        await flushPromises();
      });

      it("should request to create a pod with full descriptor", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "post",
            body: JSON.stringify({
              metadata: {
                labels: {
                  foo: "bar",
                },
                name: "foobar",
                namespace: "default",
              },
              spec: {
                containers: [{
                  name: "web",
                  image: "nginx",
                  ports: [{
                    name: "web",
                    containerPort: 80,
                    protocol: "TCP",
                  }],
                }],
              },
              kind: "Pod",
              apiVersion: "v1",
            }),
          },
        ]);
      });

      describe("when request resolves with data", () => {
        beforeEach(async () =>  {
          await fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods"],
            new Response(JSON.stringify({
              kind: "Pod",
              apiVersion: "v1",
              metadata: {
                name: "foobar",
                namespace: "default",
                labels: {
                  foo: "bar",
                },
                resourceVersion: "1",
                uid: "123456798",
              },
              spec: {
                containers: [{
                  name: "web",
                  image: "nginx",
                  ports: [{
                    name: "web",
                    containerPort: 80,
                    protocol: "TCP",
                  }],
                }],
              },
            })),
          );
        });

        it("call should resolve in a Pod instance", async () => {
          expect(await createRequest).toBeInstanceOf(Pod);
        });
      });
    });
  });

  describe("updating pods", () => {
    let api: PodApi;

    beforeEach(() => {
      api = new PodApi({
        request,
      });
    });

    describe("when updating a pod", () => {
      let updateRequest: Promise<Pod | null>;

      beforeEach(async () => {
        updateRequest = api.update({
          name: "foobar",
          namespace: "default",
        }, {
          kind: "Pod",
          apiVersion: "v1",
          metadata: {
            labels: {
              foo: "bar",
            },
          },
          spec: {
            containers: [{
              name: "web",
              image: "nginx",
              ports: [{
                name: "web",
                containerPort: 80,
                protocol: "TCP",
              }],
            }],
          },
        });

        await flushPromises();
      });

      it("should request that the pod is updated", () => {
        expect(fetchMock.mock.lastCall).toMatchObject([
          "http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods/foobar",
          {
            headers: {
              "content-type": "application/json",
            },
            method: "put",
            body: JSON.stringify({
              kind: "Pod",
              apiVersion: "v1",
              metadata: {
                labels: {
                  foo: "bar",
                },
                name: "foobar",
                namespace: "default",
              },
              spec: {
                containers: [{
                  name: "web",
                  image: "nginx",
                  ports: [{
                    name: "web",
                    containerPort: 80,
                    protocol: "TCP",
                  }],
                }],
              },
            }),
          },
        ]);
      });

      describe("when the request resolves with data", () => {
        beforeEach(async () => {
          await fetchMock.resolveSpecific(
            ["http://127.0.0.1:9999/api-kube/api/v1/namespaces/default/pods/foobar"],
            new Response(JSON.stringify({
              kind: "Pod",
              apiVersion: "v1",
              metadata: {
                name: "foobar",
                namespace: "default",
                labels: {
                  foo: "bar",
                },
                resourceVersion: "1",
                uid: "123456798",
              },
              spec: {
                containers: [{
                  name: "web",
                  image: "nginx",
                  ports: [{
                    name: "web",
                    containerPort: 80,
                    protocol: "TCP",
                  }],
                }],
              },
            })),
          );
        });

        it("the call should resolve to a Pod", async () => {
          expect(await updateRequest).toBeInstanceOf(Pod);
        });
      });
    });
  });
});
