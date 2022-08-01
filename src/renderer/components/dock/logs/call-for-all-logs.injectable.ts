import { getInjectable } from "@ogre-tools/injectable";
import callForLogsInjectable from "./call-for-logs.injectable";

const callForAllLogsInjectable = getInjectable({
  id: "call-for-all-logs",

  instantiate: (di) => {
    const callForLogs = di.inject(callForLogsInjectable);

    return async (name: string, namespace: string) => {
      const logs = await callForLogs({
        name,
        namespace,
      });

      return logs;
    };
  }
});

export default callForAllLogsInjectable;