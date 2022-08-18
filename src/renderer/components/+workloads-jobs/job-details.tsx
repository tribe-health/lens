/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./job-details.scss";

import React from "react";
import kebabCase from "lodash/kebabCase";
import { disposeOnUnmount, observer } from "mobx-react";
import { DrawerItem } from "../drawer";
import { Badge } from "../badge";
import { PodDetailsStatuses } from "../+workloads-pods/pod-details-statuses";
import { PodDetailsTolerations } from "../+workloads-pods/pod-details-tolerations";
import { PodDetailsAffinities } from "../+workloads-pods/pod-details-affinities";
import type { JobStore } from "./store";
import type { KubeObjectDetailsProps } from "../kube-object-details";
import { Job } from "../../../common/k8s-api/endpoints";
import { PodDetailsList } from "../+workloads-pods/pod-details-list";
import { KubeObjectMeta } from "../kube-object-meta";
import { makeObservable, observable, reaction } from "mobx";
import { podMetricTabs, PodCharts } from "../+workloads-pods/pod-charts";
import { ClusterMetricsResourceType } from "../../../common/cluster-types";
import { ResourceMetrics } from "../resource-metrics";
import logger from "../../../common/logger";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { SubscribeStores } from "../../kube-watch-api/kube-watch-api";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import type { PodStore } from "../+workloads-pods/store";
import podStoreInjectable from "../+workloads-pods/store.injectable";
import jobStoreInjectable from "./store.injectable";
import type { GetActiveClusterEntity } from "../../api/catalog/entity/get-active-cluster-entity.injectable";
import getActiveClusterEntityInjectable from "../../api/catalog/entity/get-active-cluster-entity.injectable";
import type { JobPodMetricData, RequestPodMetricsForJobs } from "../../../common/k8s-api/endpoints/metrics.api/request-pod-metrics-for-jobs.injectable";
import requestPodMetricsForJobsInjectable from "../../../common/k8s-api/endpoints/metrics.api/request-pod-metrics-for-jobs.injectable";

export interface JobDetailsProps extends KubeObjectDetailsProps<Job> {
}

interface Dependencies {
  subscribeStores: SubscribeStores;
  podStore: PodStore;
  jobStore: JobStore;
  getActiveClusterEntity: GetActiveClusterEntity;
  requestPodMetricsForJobs: RequestPodMetricsForJobs;
}

@observer
class NonInjectedJobDetails extends React.Component<JobDetailsProps & Dependencies> {
  @observable metrics: JobPodMetricData | null = null;

  constructor(props: JobDetailsProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    disposeOnUnmount(this, [
      reaction(() => this.props.object, () => {
        this.metrics = null;
      }),
      this.props.subscribeStores([
        this.props.podStore,
      ]),
    ]);
  }

  loadMetrics = async () => {
    const { object: job, requestPodMetricsForJobs } = this.props;

    this.metrics = await requestPodMetricsForJobs([job], job.getNs(), "");
  };

  render() {
    const { object: job, jobStore, getActiveClusterEntity } = this.props;

    if (!job) {
      return null;
    }

    if (!(job instanceof Job)) {
      logger.error("[JobDetails]: passed object that is not an instanceof Job", job);

      return null;
    }

    const selectors = job.getSelectors();
    const nodeSelector = job.getNodeSelectors();
    const images = job.getImages();
    const childPods = jobStore.getChildPods(job);
    const condition = job.getCondition();
    const isMetricHidden = getActiveClusterEntity()?.isMetricHidden(ClusterMetricsResourceType.Job);

    return (
      <div className="JobDetails">
        {!isMetricHidden && (
          <ResourceMetrics
            loader={this.loadMetrics}
            tabs={podMetricTabs}
            object={job}
            metrics={this.metrics}
          >
            <PodCharts />
          </ResourceMetrics>
        )}
        <KubeObjectMeta object={job}/>
        <DrawerItem name="Selector" labelsOnly>
          {
            Object.keys(selectors).map(label => <Badge key={label} label={label}/>)
          }
        </DrawerItem>
        {nodeSelector.length > 0 && (
          <DrawerItem name="Node Selector" labelsOnly>
            {
              nodeSelector.map(label => (
                <Badge key={label} label={label}/>
              ))
            }
          </DrawerItem>
        )}
        {images.length > 0 && (
          <DrawerItem name="Images">
            {
              images.map(image => <p key={image}>{image}</p>)
            }
          </DrawerItem>
        )}
        <DrawerItem
          name="Conditions"
          className="conditions"
          labelsOnly
        >
          {condition && (
            <Badge
              className={kebabCase(condition.type)}
              label={condition.type}
              tooltip={condition.message}
            />
          )}
        </DrawerItem>
        <DrawerItem name="Completions">
          {job.getDesiredCompletions()}
        </DrawerItem>
        <DrawerItem name="Parallelism">
          {job.getParallelism()}
        </DrawerItem>
        <PodDetailsTolerations workload={job}/>
        <PodDetailsAffinities workload={job}/>
        <DrawerItem name="Pod Status" className="pod-status">
          <PodDetailsStatuses pods={childPods}/>
        </DrawerItem>
        <PodDetailsList pods={childPods} owner={job}/>
      </div>
    );
  }
}

export const JobDetails = withInjectables<Dependencies, JobDetailsProps>(NonInjectedJobDetails, {
  getProps: (di, props) => ({
    ...props,
    subscribeStores: di.inject(subscribeStoresInjectable),
    podStore: di.inject(podStoreInjectable),
    jobStore: di.inject(jobStoreInjectable),
    getActiveClusterEntity: di.inject(getActiveClusterEntityInjectable),
    requestPodMetricsForJobs: di.inject(requestPodMetricsForJobsInjectable),
  }),
});

