/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { urlBuilderFor } from "../../../utils/buildUrl";
import { apiBaseInjectionToken } from "../../api-base";

const requestValuesEndpoint = urlBuilderFor("/v2/charts/:repo/:name/values");

export type RequestHelmChartValues = (repo: string, name: string, version: string) => Promise<string>;

const requestHelmChartValuesInjectable = getInjectable({
  id: "request-helm-chart-values",
  instantiate: (di): RequestHelmChartValues => {
    const apiBase = di.inject(apiBaseInjectionToken);

    return (repo, name, version) => (
      apiBase.get(requestValuesEndpoint.compile({ repo, name }, { version }))
    );
  },
});

export default requestHelmChartValuesInjectable;
