/**
 * Copyright (c) OpenLens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import readFileBufferInjectable from "../../../common/fs/read-file-buffer.injectable";
import getAbsolutePathInjectable from "../../../common/path/get-absolute-path.injectable";
import joinPathsInjectable from "../../../common/path/join-paths.injectable";
import staticFilesDirectoryInjectable from "../../../common/vars/static-files-directory.injectable";
import appNameInjectable from "../../app-paths/app-name/app-name.injectable";
import type { LensApiRequest } from "../../router/route";
import path from "path";
import type { SupportedFileExtension } from "../../router/router-content-types";
import { contentTypes } from "../../router/router-content-types";
import loggerInjectable from "../../../common/logger.injectable";
import { publicPath } from "../../../common/vars";

const prodStaticFileRouteHandlerInjectable = getInjectable({
  id: "prod-static-file-route-handler",
  instantiate: (di) => {
    const readFileBuffer = di.inject(readFileBufferInjectable);
    const getAbsolutePath = di.inject(getAbsolutePathInjectable);
    const joinPaths = di.inject(joinPathsInjectable);
    const staticFilesDirectory = di.inject(staticFilesDirectoryInjectable);
    const appName = di.inject(appNameInjectable);
    const logger = di.inject(loggerInjectable);

    return async ({ params }: LensApiRequest<"/{path*}">) => {
      let filePath = params.path;


      for (let retryCount = 0; retryCount < 5; retryCount += 1) {
        const asset = joinPaths(staticFilesDirectory, filePath);
        const normalizedFilePath = getAbsolutePath(asset);

        if (!normalizedFilePath.startsWith(staticFilesDirectory)) {
          return { statusCode: 404 };
        }

        try {
          const fileExtension = path
            .extname(asset)
            .slice(1) as SupportedFileExtension;

          const contentType = contentTypes[fileExtension] || contentTypes.txt;

          return { response: await readFileBuffer(asset), contentType };
        } catch (err) {
          if (retryCount > 5) {
            logger.error("handleStaticFile:", String(err));

            return { statusCode: 404 };
          }

          filePath = `${publicPath}/${appName}.html`;
        }
      }

      return { statusCode: 404 };
    };
  },
});

export default prodStaticFileRouteHandlerInjectable;
