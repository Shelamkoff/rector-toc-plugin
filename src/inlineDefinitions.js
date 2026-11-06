/** Capture Rector's canonical inline-to-text capabilities without mounting widgets. */
export function createInlineTextResolver(inlinePlugins) {
  if (inlinePlugins === undefined) return null
  if (!Array.isArray(inlinePlugins)) {
    throw new TypeError('inlinePlugins must be a dense array of Rector inline definitions')
  }
  const resolvers = new Map()
  for (let index = 0; index < inlinePlugins.length; index++) {
    if (!Object.hasOwn(inlinePlugins, index)) throw new TypeError('inlinePlugins must be dense')
    const definition = inlinePlugins[index]
    const type = definition?.type
    if (typeof type !== 'string' || !type) throw new TypeError('Inline definition needs a type')
    if (resolvers.has(type)) throw new Error('Duplicate inline definition type: ' + type)
    const schema = definition.schema
    const toText = definition.toText
    if (toText !== undefined && typeof toText !== 'function') {
      throw new TypeError('Inline definition toText must be a function')
    }
    if (toText !== undefined && (!schema || typeof schema.decode !== 'function'
      || !Number.isSafeInteger(schema.currentVersion) || schema.currentVersion < 1)) {
      throw new TypeError('Inline definition toText requires a current versioned schema')
    }
    resolvers.set(type, toText === undefined ? null : {
      definition, schema, decode: schema.decode,
      toText, version: schema.currentVersion,
    })
  }

  const freeze = value => {
    if (!value || typeof value !== 'object') return value
    for (const part of Object.values(value)) freeze(part)
    return Object.freeze(value)
  }
  return widget => {
    const record = widget && resolvers.get(widget.type)
    if (!record) return null
    if (widget.dataVersion !== record.version) {
      throw new RangeError('Unsupported inline widget version for ' + widget.type)
    }
    // Like Rector's pure toText boundary, own and freeze decoded payloads.
    // No widget runtime, provider request or DOM projection is created here.
    const decoded = Reflect.apply(record.decode, record.schema, [{
      dataVersion: widget.dataVersion,
      data: structuredClone(widget.data),
    }])
    if (!decoded || decoded.dataVersion !== record.version
      || !decoded.data || typeof decoded.data !== 'object' || Array.isArray(decoded.data)) {
      throw new TypeError('Inline schema returned an invalid payload for ' + widget.type)
    }
    const result = Reflect.apply(record.toText, record.definition, [freeze(decoded.data)])
    if (typeof result !== 'string') throw new TypeError('Inline toText must return a string for ' + widget.type)
    return result
  }
}
