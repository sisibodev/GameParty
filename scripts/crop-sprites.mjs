import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(__dirname, '../public/assets/cops-and-robbers')

async function detectGridBoundaries(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info

  function rowDarkCount(y) {
    let dark = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3
      if (brightness < 200 && data[i+3] > 50) dark++
    }
    return dark
  }

  function colDarkCount(x) {
    let dark = 0
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3
      if (brightness < 200 && data[i+3] > 50) dark++
    }
    return dark
  }

  // 레이블 경계 = darkCount 가 가장 적은 지점(빈 구분선)
  function findBestBoundary(counts, approx, range = 40) {
    let best = approx
    let bestScore = Infinity
    for (let i = approx - range; i <= approx + range; i++) {
      if (i < 0 || i >= counts.length) continue
      if (counts[i] < bestScore) { bestScore = counts[i]; best = i }
    }
    return best
  }

  const rowCounts = Array.from({ length: height }, (_, y) => rowDarkCount(y))
  const colCounts = Array.from({ length: width }, (_, x) => colDarkCount(x))

  const approxCellH = Math.round(height / 5)
  const approxCellW = Math.round(width / 9)

  const topLabel = findBestBoundary(rowCounts, approxCellH)
  const leftLabel = findBestBoundary(colCounts, approxCellW)

  const cellW = Math.round((width - leftLabel) / 8)
  const cellH = Math.round((height - topLabel) / 4)

  return { topLabel, leftLabel, cellW, cellH }
}

async function detectActualBoundaries(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  function rowDarkCount(y) {
    let dark = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3
      if (brightness < 200 && data[i+3] > 50) dark++
    }
    return dark
  }

  function colDarkCount(x) {
    let dark = 0
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3
      if (brightness < 200 && data[i+3] > 50) dark++
    }
    return dark
  }

  // Find gap groups (runs of near-empty rows/cols)
  function findGapGroups(counts, totalLen) {
    const groups = []
    let inGap = false, start = 0
    for (let i = 0; i < totalLen; i++) {
      if (counts[i] < 10 && !inGap) { inGap = true; start = i }
      else if (counts[i] >= 10 && inGap) { groups.push({ start, end: i - 1 }); inGap = false }
    }
    if (inGap) groups.push({ start, end: totalLen - 1 })
    return groups
  }

  const rowCounts = Array.from({ length: height }, (_, y) => rowDarkCount(y))
  const colCounts = Array.from({ length: width }, (_, x) => colDarkCount(x))

  const rowGaps = findGapGroups(rowCounts, height)
  const colGaps = findGapGroups(colCounts, width)

  // Image structure: [empty_top | label_text | label_sep_gap | sprite0 | gap | sprite1 | gap | ... | empty_bottom]
  // If image starts with empty rows (rowGaps[0].start===0), skip 2 top gaps; else skip 1
  const labelGapIdx = rowGaps[0].start === 0 ? 1 : 0
  const topLabel = rowGaps[labelGapIdx].end + 1
  const rowStarts = [topLabel]
  for (let i = labelGapIdx + 1; i < rowGaps.length - 1; i++) rowStarts.push(rowGaps[i].end + 1)
  const cellH = rowStarts.length > 1
    ? Math.round((rowStarts[rowStarts.length - 1] - rowStarts[0]) / (rowStarts.length - 1))
    : Math.round((height - topLabel) / 4)

  // Col starts: first gap end+1 after the left label
  const leftLabel = colGaps[0].end + 1
  const cellW = Math.round((width - leftLabel) / 8)

  return { topLabel, leftLabel, cellW, cellH, rowStarts }
}

async function cropSpriteSheet(srcFile, dstFile, label) {
  console.log(`\n처리 중: ${label}`)
  const { topLabel, leftLabel, cellW, cellH, rowStarts } = await detectActualBoundaries(srcFile)
  console.log(`  레이블: top=${topLabel}px, left=${leftLabel}px`)
  console.log(`  셀 크기: ${cellW}×${cellH}px`)
  console.log(`  행 시작: ${rowStarts.join(', ')}`)

  const { width: imgW, height: imgH } = await sharp(srcFile).metadata()
  const cells = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const x = leftLabel + col * cellW
      const y = rowStarts[row] ?? (topLabel + row * cellH)
      const w = Math.min(cellW, imgW - x)
      const h = Math.min(cellH, imgH - y)

      // 1. 셀 크롭
      const cellBuf = await sharp(srcFile)
        .extract({ left: x, top: y, width: w, height: h })
        .extend({ right: cellW - w, bottom: cellH - h, background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      // 2. 흰 배경 제거: 밝은 픽셀(R>230 & G>230 & B>230)을 투명하게
      const px = cellBuf.data
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 230 && px[i+1] > 230 && px[i+2] > 230) px[i+3] = 0
      }

      cells.push({
        input: await sharp(px, { raw: { width: cellW, height: cellH, channels: 4 } })
          .png()
          .toBuffer(),
        left: col * cellW,
        top: row * cellH,
      })
    }
  }

  await sharp({
    create: { width: cellW * 8, height: cellH * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(cells)
    .png()
    .toFile(dstFile)

  console.log(`  저장: ${path.basename(dstFile)} (${cellW * 8}×${cellH * 4}px)`)
}

async function main() {
  await cropSpriteSheet(path.join(ASSETS, 'thief-reference.png'), path.join(ASSETS, 'thief.png'), '도둑')
  await cropSpriteSheet(path.join(ASSETS, 'cop-reference.png'), path.join(ASSETS, 'cop.png'), '경찰')
  console.log('\n완료!')
}

main().catch(console.error)
