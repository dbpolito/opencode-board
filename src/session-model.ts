export type SessionModel = { id: string; providerID: string; variant?: string }

type Source = {
  get(input: { sessionID: string }): Promise<{ location: { directory: string }; model?: SessionModel }>
  context(input: { sessionID: string }): Promise<readonly { type: string; model?: SessionModel }[]>
}

// Read the launching session, never a server default or whichever tab is focused.
export async function sessionOrigin(source: Source, sessionID: string) {
  const session = await source.get({ sessionID })
  const model = session.model ?? (await source.context({ sessionID })).findLast((item) => item.type === "assistant")?.model
  if (!model?.id || !model.providerID) throw new Error("The launching conversation has no selected model. Select a model before starting a task session.")
  return { directory: session.location.directory, model: { id: model.id, providerID: model.providerID, ...(model.variant === undefined ? {} : { variant: model.variant }) } }
}
