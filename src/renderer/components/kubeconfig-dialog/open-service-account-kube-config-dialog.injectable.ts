/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { ServiceAccount } from "../../../common/k8s-api/endpoints";
import { urlBuilderFor } from "../../../common/utils/buildUrl";
import apiBaseInjectable from "../../k8s/api-base.injectable";
import openKubeconfigDialogInjectable from "./open.injectable";

export type OpenServiceAccountKubeConfigDialog = (account: ServiceAccount) => void;

const serviceAccountConfigEndpoint = urlBuilderFor("/kubeconfig/service-account/:namespace/:name");

const openServiceAccountKubeConfigDialogInjectable = getInjectable({
  id: "open-service-account-kube-config-dialog",
  instantiate: (di): OpenServiceAccountKubeConfigDialog => {
    const apiBase = di.inject(apiBaseInjectable);
    const openKubeconfigDialog = di.inject(openKubeconfigDialogInjectable);

    return (account) => openKubeconfigDialog({
      title: `${account.getName()} kubeconfig`,
      loader: () => apiBase.get(serviceAccountConfigEndpoint.compile({
        name: account.getName(),
        namespace: account.getNs(),
      })),
    });
  },
});

export default openServiceAccountKubeConfigDialogInjectable;
