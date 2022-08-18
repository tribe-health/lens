/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";

import type { ClusterOverviewStorageState } from "./cluster-overview-store";
import { ClusterOverviewStore, MetricNodeRole, MetricType } from "./cluster-overview-store";
import createStorageInjectable from "../../../utils/create-storage/create-storage.injectable";
import { kubeObjectStoreInjectionToken } from "../../../../common/k8s-api/api-manager/manager.injectable";
import clusterApiInjectable from "../../../../common/k8s-api/endpoints/cluster.api.injectable";
import storesAndApisCanBeCreatedInjectable from "../../../stores-apis-can-be-created.injectable";
import assert from "assert";
import nodeStoreInjectable from "../../+nodes/store.injectable";
import requestClusterMetricsByNodeNamesInjectable from "../../../../common/k8s-api/endpoints/metrics.api/request-cluster-metrics-by-node-names.injectable";

const clusterOverviewStoreInjectable = getInjectable({
  id: "cluster-overview-store",

  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "clusterOverviewStore is only available in certain environments");
    const createStorage = di.inject(createStorageInjectable);
    const clusterApi = di.inject(clusterApiInjectable);

    return new ClusterOverviewStore({
      storage: createStorage<ClusterOverviewStorageState>(
        "cluster_overview",
        {
          metricType: MetricType.CPU, // setup defaults
          metricNodeRole: MetricNodeRole.WORKER,
        },
      ),
      nodeStore: di.inject(nodeStoreInjectable),
      requestClusterMetricsByNodeNames: di.inject(requestClusterMetricsByNodeNamesInjectable),
    }, clusterApi);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default clusterOverviewStoreInjectable;
