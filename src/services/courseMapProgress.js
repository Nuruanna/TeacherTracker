const positiveInteger = value => Number.isInteger(value) && value > 0;

export function rainbowProgressStep(item) {
  if (positiveInteger(item?.step)) return item.step;
  if (
    item?.step == null
    && positiveInteger(item?.stepStart)
    && positiveInteger(item?.stepEnd)
    && item.stepStart <= item.stepEnd
  ) return item.stepEnd;
  return null;
}

export function validRainbowStepRange(item) {
  return item?.step == null
    && positiveInteger(item?.stepStart)
    && positiveInteger(item?.stepEnd)
    && item.stepStart <= item.stepEnd;
}
