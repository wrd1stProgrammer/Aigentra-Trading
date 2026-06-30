export type TraderDetailInitialOverlayInput = {
  readonly hasRenderableDetail: boolean;
  readonly isFetching: boolean;
  readonly isHydratedDetail: boolean;
};

export function shouldShowTraderDetailInitialOverlay({
  hasRenderableDetail,
  isFetching,
  isHydratedDetail
}: TraderDetailInitialOverlayInput) {
  return isFetching && !hasRenderableDetail && !isHydratedDetail;
}
