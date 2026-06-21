export const DEMO_STEP_COLOR = "rgb(101, 212, 159)";
export const DEMO_DIALOG_BG = "rgb(17, 17, 17)";

export const demoStepStyles = {
  "& [data-scope=steps][data-part=indicator]": {
    borderColor: DEMO_STEP_COLOR,
    color: DEMO_STEP_COLOR,
  },
  "& [data-scope=steps][data-part=indicator][data-complete]": {
    bg: `${DEMO_STEP_COLOR} !important`,
    borderColor: DEMO_STEP_COLOR,
    color: `${DEMO_DIALOG_BG} !important`,
  },
  "& [data-scope=steps][data-part=indicator][data-current]": {
    bg: "transparent !important",
    borderColor: DEMO_STEP_COLOR,
    color: DEMO_STEP_COLOR,
  },
  "& [data-scope=steps][data-part=indicator][data-incomplete]": {
    bg: "transparent !important",
    borderColor: DEMO_STEP_COLOR,
    color: DEMO_STEP_COLOR,
  },
  "& [data-scope=steps][data-part=separator]": {
    bg: DEMO_STEP_COLOR,
  },
};
