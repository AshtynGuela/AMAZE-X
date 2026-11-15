import {
  summarize,
  findEvents,
  evaluateRules,
  sweepDates,
} from "../engine/index.mjs";
import { landingWindows } from "../engine/landing.mjs";
import { nearbyMetrics, nearbySky } from "../engine/nearby.mjs";
self.onmessage = (event) => {
  const {
    id,
    data,
    start,
    duration,
    mask,
    minAntennaEl,
    profile,
    kind,
    end,
    arrayMode,
    arrayAzimuth,
  } = event.data;
  try {
    if (kind === "nearby-preview") {
      const { candidates, mast } = event.data;
      candidates.forEach(({ point, elevationM, mask }, index) => {
        const sky = nearbySky(data, point, elevationM, mast, start, duration);
        self.postMessage({ index, nearby: nearbyMetrics(sky, start, duration, mask, minAntennaEl, profile) });
      });
      self.postMessage({ done: true });
      return;
    }
    if (kind === "landing") {
      self.postMessage({ id, landing: landingWindows(data, start, end, duration, mask, minAntennaEl, profile) });
      return;
    }
    if (kind === "sweep") {
      self.postMessage({
        id,
        sweep: sweepDates(data, start, end, duration, mask, minAntennaEl),
      });
      return;
    }
    const events = findEvents(data, mask),
      metrics = summarize(
        data,
        start,
        duration,
        mask,
        minAntennaEl,
        0,
        events,
        arrayMode,
        arrayAzimuth,
      );
    self.postMessage({
      id,
      metrics,
      rules: evaluateRules(metrics, profile, !!mask),
    });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
