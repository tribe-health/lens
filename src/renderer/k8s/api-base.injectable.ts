/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { apiBaseInjectionToken } from "../../common/k8s-api/api-base";
import { JsonApi } from "../../common/k8s-api/json-api";
import { apiPrefix, isDebugging } from "../../common/vars";
import isDevelopmentInjectable from "../../common/vars/is-development.injectable";

const apiBaseInjectable = getInjectable({
  id: "api-base",
  instantiate: (di) => new JsonApi({
    serverAddress: `http://127.0.0.1:${window.location.port}`,
    apiBase: apiPrefix,
    debug: di.inject(isDevelopmentInjectable) || isDebugging,
  }, {
    headers: {
      "Host": window.location.host,
    },
  }),
  injectionToken: apiBaseInjectionToken,
});

export default apiBaseInjectable;
