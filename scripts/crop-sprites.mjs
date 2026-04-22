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

async function cropSpriteSheet(srcFile, dstFile, label) {
  console.log(`\n처리 중: ${label}`)
  const { topLabel, leftLabel, cellW, cellH } = await detectGridBoundaries(srcFile)
  console.log(`  레이블: top=${topLabel}px, left=${leftLabel}px`)
  console.log(`  셀 크기: ${cellW}×${cellH}px`)

  const { width: imgW, height: imgH } = await sharp(srcFile).metadata()
  const cells = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const x = leftLabel + col * cellW
      const y = topLabel + row * cellH
      const w = Math.min(cellW, imgW - x)
      const h = Math.min(cellH, imgH - y)
      cells.push({
        input: await sharp(srcFile)
          .extract({ left: x, top: y, width: w, height: h })
          .extend({ right: cellW - w, bottom: cellH - h, background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
