/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./details.scss";

import React from "react";
import upperFirst from "lodash/upperFirst";
import kebabCase from "lodash/kebabCase";
import { disposeOnUnmount, observer } from "mobx-react";
import { DrawerItem, DrawerItemLabels } from "../drawer";
import { Badge } from "../badge";
import { ResourceMetrics } from "../resource-metrics";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { formatNodeTaint, Node } from "../../../common/k8s-api/endpoints";
import { NodeCharts } from "./node-charts";
import { makeObservable, observable, reaction } from "mobx";
import { PodDetailsList } from "../+workloads-pods/pod-details-list";
import { KubeObjectMeta } from "../kube-object-meta";
import { ClusterMetricsResourceType } from "../../../common/cluster-types";
import { NodeDetailsResources } from "./details-resources";
import { DrawerTitle } from "../drawer/drawer-title";
import logger from "../../../common/logger";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { SubscribeStores } from "../../kube-watch-api/kube-watch-api";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import type { PodStore } from "../+workloads-pods/store";
import podStoreInjectable from "../+workloads-pods/store.injectable";
import type { GetActiveClusterEntity } from "../../api/catalog/entity/get-active-cluster-entity.injectable";
import getActiveClusterEntityInjectable from "../../api/catalog/entity/get-active-cluster-entity.injectable";
import type { ClusterMetricData, RequestClusterMetricsByNodeNames } from "../../../common/k8s-api/endpoints/metrics.api/request-cluster-metrics-by-node-names.injectable";
import requestClusterMetricsByNodeNamesInjectable from "../../../common/k8s-api/endpoints/metrics.api/request-cluster-metrics-by-node-names.injectable";

export interface NodeDetailsProps extends KubeObjectDetailsProps<Node> {
}

interface Dependencies {
  subscribeStores: SubscribeStores;
  podStore: PodStore;
  getActiveClusterEntity: GetActiveClusterEntity;
  requestClusterMetricsByNodeNames: RequestClusterMetricsByNodeNames;
}

@observer
class NonInjectedNodeDetails extends React.Component<NodeDetailsProps & Dependencies> {
  @observable metrics: ClusterMetricData | null = null;

  constructor(props: NodeDetailsProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    disposeOnUnmount(this, [
      reaction(() => this.props.object.getName(), () => {
        this.metrics = null;
      }),

      this.props.subscribeStores([
        this.props.podStore,
      ]),
    ]);
  }

  loadMetrics = async () => {
    const { object: node, requestClusterMetricsByNodeNames } = this.props;

    this.metrics = await requestClusterMetricsByNodeNames([node.getName()]);
  };

  render() {
    const { object: node, podStore, getActiveClusterEntity } = this.props;

    if (!node) {
      return null;
    }

    if (!(node instanceof Node)) {
      logger.error("[NodeDetails]: passed object that is not an instanceof Node", node);

      return null;
    }

    const { nodeInfo, addresses } = node.status ?? {};
    const conditions = node.getActiveConditions();
    const taints = node.getTaints();
    const childPods = podStore.getPodsByNode(node.getName());
    const { metrics } = this;
    const isMetricHidden = getActiveClusterEntity()?.isMetricHidden(ClusterMetricsResourceType.Node);

    return (
      <div className="NodeDetails">
        {!isMetricHidden && podStore.isLoaded && (
          <ResourceMetrics
            loader={this.loadMetrics}
            tabs={[
              "CPU",
              "Memory",
              "Disk",
              "Pods",
            ]}
            object={node}
            metrics={metrics}
          >
            <NodeCharts/>
          </ResourceMetrics>
        )}
        <KubeObjectMeta object={node} hideFields={["labels", "annotations", "uid", "resourceVersion", "selfLink"]}/>
        {addresses && (
          <DrawerItem name="Addresses">
            {
              addresses.map(({ type, address }) => (
                <p key={type}>
                  {`${type}: ${address}`}
                </p>
              ))
            }
          </DrawerItem>
        )}
        {nodeInfo && (
          <>
            <DrawerItem name="OS">
              {`${nodeInfo.operatingSystem} (${nodeInfo.architecture})`}
            </DrawerItem>
            <DrawerItem name="OS Image">
              {nodeInfo.osImage}
            </DrawerItem>
            <DrawerItem name="Kernel version">
              {nodeInfo.kernelVersion}
            </DrawerItem>
            <DrawerItem name="Container runtime">
              {nodeInfo.containerRuntimeVersion}
            </DrawerItem>
            <DrawerItem name="Kubelet version">
              {nodeInfo.kubeletVersion}
            </DrawerItem>
          </>
        )}
        <DrawerItemLabels
          name="Labels"
          labels={node.getLabels()}
        />
        <DrawerItemLabels
          name="Annotations"
          labels={node.getAnnotations()}
        />
        {taints.length > 0 && (
          <DrawerItem name="Taints" labelsOnly>
            {taints.map(taint => <Badge key={taint.key} label={formatNodeTaint(taint)} />)}
          </DrawerItem>
        )}
        {conditions && (
          <DrawerItem
            name="Conditions"
            className="conditions"
            labelsOnly
          >
            {conditions.map(condition => (
              <Badge
                key={condition.type}
                label={condition.type}
                className={kebabCase(condition.type)}
                tooltip={{
                  formatters: {
                    tableView: true,
                  },
                  children: Object.entries(condition)
                    .map(([key, value]) => (
                      <div key={key} className="flex gaps align-center">
                        <div className="name">{upperFirst(key)}</div>
                        <div className="value">{value}</div>
                      </div>
                    )),
                }}
              />
            ))}
          </DrawerItem>
        )}
        <DrawerTitle>Capacity</DrawerTitle>
        <NodeDetailsResources node={node} type="capacity"/>
        <DrawerTitle>Allocatable</DrawerTitle>
        <NodeDetailsResources node={node} type="allocatable"/>
        <PodDetailsList
          pods={childPods}
          owner={node}
          maxCpu={node.getCpuCapacity()}
          maxMemory={node.getMemoryCapacity()}
        />
      </div>
    );
  }
}

export const NodeDetails = withInjectables<Dependencies, NodeDetailsProps>(NonInjectedNodeDetails, {
  getProps: (di, props) => ({
    ...props,
    subscribeStores: di.inject(subscribeStoresInjectable),
    podStore: di.inject(podStoreInjectable),
    getActiveClusterEntity: di.inject(getActiveClusterEntityInjectable),
    requestClusterMetricsByNodeNames: di.inject(requestClusterMetricsByNodeNamesInjectable),
  }),
});

