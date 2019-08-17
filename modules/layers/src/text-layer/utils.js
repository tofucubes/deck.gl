// TODO merge with icon-layer/icon-manager
/* global document */
import {log} from '@deck.gl/core';

const MISSING_CHAR_WIDTH = 32;

export function nextPowOfTwo(number) {
  return Math.pow(2, Math.ceil(Math.log2(number)));
}

const BASE_STYLE = 'position: absolute; top: 0; left: 0; z-index: 1000;';

/**
 * Generate character mapping table or update from an existing mapping table
 * @param characterSet {Array|Set} new characters
 * @param getFontWidth {Function} function to get width of each character
 * @param fontHeight {Number} height of font
 * @param buffer {Number} buffer surround each character
 * @param maxCanvasWidth {Number} max width of font atlas
 * @param mapping {Object} old mapping table
 * @param xOffset {Number} x position of last character in old mapping table
 * @param yOffset {Number} y position of last character in old mapping table
 * @returns {{
 *   mapping: Object,
 *   xOffset: Number, x position of last character
 *   yOffset: Number, y position of last character in old mapping table
 *   canvasHeight: Number, height of the font atlas canvas, power of 2
 *  }}
 */
export function buildMapping({
  characterSet,
  getFontWidth,
  fontHeight,
  buffer,
  maxCanvasWidth,
  mapping = {},
  xOffset = 0,
  yOffset = 0
}) {
  let row = 0;
  // continue from x position of last character in the old mapping
  let x = xOffset;
  Array.from(characterSet).forEach((char, i) => {
    if (!mapping[char]) {
      // measure texts
      // TODO - use Advanced text metrics when they are adopted:
      // https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics
      const width = getFontWidth(char, i);

      if (x + width + buffer * 2 > maxCanvasWidth) {
        x = 0;
        row++;
      }
      mapping[char] = {
        x: x + buffer,
        y: yOffset + row * (fontHeight + buffer * 2) + buffer,
        width,
        height: fontHeight,
        mask: true
      };
      x += width + buffer * 2;
    }
  });

  const rowHeight = fontHeight + buffer * 2;

  return {
    mapping,
    xOffset: x,
    yOffset: yOffset + row * rowHeight,
    canvasHeight: nextPowOfTwo(yOffset + (row + 1) * rowHeight)
  };
}

export function autoWrapping(
  string,
  iconMapping,
  height,
  width,
  wordBreak,
  fontSize,
  fontFamily,
  fontWeight,
  textAlign
) {
  const characters = Array.from(string);
  const textDiv = document.createElement('div');
  textDiv.style = `
    ${BASE_STYLE}
    word-break: ${wordBreak};
    height: ${height};
    width: ${width}px;
    font-size: ${fontSize}px;
    font-family: ${fontFamily};
    font-weight: ${fontWeight};
    text-align: ${textAlign || 'left'}
  `;

  characters.map((character, i) => {
    const span = document.createElement('span');
    span.innerText = character;
    textDiv.appendChild(span);
  });

  document.body.appendChild(textDiv);
  return textDiv;
}

export function transformRow(
  row,
  iconMapping,
  width,
  lineHeight,
  wordBreak,
  fontSize,
  fontFamily,
  fontWeight,
  textAlign
) {
  let textDiv;
  if (wordBreak) {
    const height = Object.values(iconMapping)[0].height * lineHeight;
    textDiv = autoWrapping(
      row,
      iconMapping,
      height,
      width,
      wordBreak,
      fontSize,
      fontFamily,
      fontWeight,
      textAlign
    );
  }

  let offsetLeft = 0;
  let rowHeight = 0;

  let characters = Array.from(row);

  characters = characters.map((character, i) => {
    let datum;

    if (wordBreak) {
      const span = textDiv.childNodes[i];
      const rect = span.getBoundingClientRect();

      datum = {
        text: character,
        offsetTop: rect.top,
        offsetLeft: rect.left
      };

      const frame = iconMapping[character];

      if (frame) {
        offsetLeft += rect.width;
      } else {
        log.warn(`Missing character: ${character}`)();
        offsetLeft += MISSING_CHAR_WIDTH;
      }

      if (i === characters.length - 1) {
        // frame.height should be a constant
        rowHeight = rect.bottom;
      }
    } else {
      datum = {
        text: character,
        offsetTop: 0,
        offsetLeft
      };

      const frame = iconMapping[character];

      if (frame) {
        offsetLeft += frame.width;
        if (!rowHeight) {
          // frame.height should be a constant
          rowHeight = frame.height * lineHeight;
        }
      } else {
        log.warn(`Missing character: ${character}`)();
        offsetLeft += MISSING_CHAR_WIDTH;
      }
    }

    return datum;
  });

  return {
    characters,
    rowWidth: wordBreak ? width : offsetLeft,
    rowHeight
  };
}

/**
 * Transform a text paragraph to an array of characters, each character contains
 * @param props:
 *   - paragraph {String}
 *   - wordBreak {String} css word-break option
 *   - fontSize {number} css font-size
 *   - width {number} css width of the element
 *   - lineHeight {Number} css line-height
 *   - iconMapping {Object} character mapping table for retrieving a character from font atlas
 *   - transformCharacter {Function} callback to transform a single character
 * @param transformedData {Array} output transformed data array, each datum contains
 *   - text: character
 *   - index: character index in the paragraph
 *   - offsetLeft: x offset in the row,
 *   - offsetTop: y offset in the paragraph
 *   - size: [width, height] size of the paragraph
 *   - rowSize: [rowWidth, rowHeight] size of the row
 *   - len: length of the paragraph
 */
export function transformParagraph(
  {
    paragraph,
    iconMapping,
    transformCharacter,
    // styling
    lineHeight,
    wordBreak,
    fontSize,
    fontFamily,
    fontWeight,
    width,
    textAlign
  },
  transformedData
) {
  const rows = paragraph.split('\n');

  // width and height of the paragraph
  const size = [0, 0];
  let offsetTop = 0;

  rows.forEach(row => {
    const {characters, rowWidth, rowHeight} = transformRow(
      row,
      iconMapping,
      width,
      lineHeight,
      wordBreak,
      fontSize,
      fontFamily,
      fontWeight,
      textAlign
    );
    const rowSize = [rowWidth, rowHeight];

    characters.forEach(datum => {
      datum.offsetTop = datum.offsetTop + offsetTop;
      datum.size = size;
      datum.rowSize = datum.rowSize || rowSize;

      transformedData.push(transformCharacter(datum));
    });

    offsetTop = offsetTop + rowHeight;
    size[0] = Math.max(size[0], rowWidth);
  });

  // last row
  size[1] = offsetTop;
}
