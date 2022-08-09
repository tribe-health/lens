/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable, lifecycleEnum } from "@ogre-tools/injectable";
import { asyncComputed } from "@ogre-tools/injectable-react";
import type { HelmChart } from "../../../../common/k8s-api/endpoints/helm-charts.api";
import requestHelmChartVersionsInjectable from "../../../../common/k8s-api/endpoints/helm-charts.api/get-versions.injectable";

const versionsOfSelectedHelmChartInjectable = getInjectable({
  id: "versions-of-selected-helm-chart",

  instantiate: (di, chart: HelmChart) => {
    const requestHelmChartVersions = di.inject(requestHelmChartVersionsInjectable);

    return asyncComputed(
      async () =>
        await requestHelmChartVersions(chart.getRepository(), chart.getName()),
      [],
    );
  },

  lifecycle: lifecycleEnum.keyedSingleton({
    getInstanceKey: (di, chart: HelmChart) => chart.getId(),
  }),
});

export default versionsOfSelectedHelmChartInjectable;
