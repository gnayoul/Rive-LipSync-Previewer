const TARGET_SAMPLE_RATE = 16_000

/** Decode uploaded audio (wav/ogg/mp3) to mono Float32 PCM @ 16 kHz for Whisper. */
export async function decodeAudioFileToMono16k(
  file: Blob,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

  const arrayBuffer = await file.arrayBuffer()
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  const context = new AudioCtx()

  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0))
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

    const channelCount = decoded.numberOfChannels
    const length = decoded.length
    const mixed = new Float32Array(length)

    if (channelCount === 1) {
      mixed.set(decoded.getChannelData(0))
    } else {
      const channels: Float32Array[] = []
      for (let c = 0; c < channelCount; c += 1) {
        channels.push(decoded.getChannelData(c))
      }
      for (let i = 0; i < length; i += 1) {
        let sum = 0
        for (let c = 0; c < channelCount; c += 1) sum += channels[c][i]
        mixed[i] = sum / channelCount
      }
    }

    if (decoded.sampleRate === TARGET_SAMPLE_RATE) return mixed
    return resampleLinear(mixed, decoded.sampleRate, TARGET_SAMPLE_RATE)
  } finally {
    await context.close().catch(() => undefined)
  }
}

function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const srcIndex = i * ratio
    const left = Math.floor(srcIndex)
    const right = Math.min(left + 1, input.length - 1)
    const frac = srcIndex - left
    output[i] = input[left] * (1 - frac) + input[right] * frac
  }
  return output
}
