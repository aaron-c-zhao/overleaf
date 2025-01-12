// @ts-check
const { RetainOp, InsertOp, RemoveOp } = require('./operation/scan_op')
const Range = require('./range')

/**
 * @typedef {import("./types").CommentRawData} CommentRawData
 * @typedef {import("./operation/text_operation")} TextOperation
 */

class Comment {
  /**
   * @readonly
   * @type {ReadonlyArray<Range>}
   */
  ranges = []

  /**
   * @readonly
   * @type {boolean}
   */
  resolved = false

  /**
   * @param {ReadonlyArray<Range>} ranges
   * @param {boolean} [resolved]
   */
  constructor(ranges, resolved = false) {
    this.resolved = resolved
    this.ranges = this.mergeRanges(ranges)
  }

  /**
   *
   * @param {number} cursor
   * @param {number} length
   * @param {boolean} [extendComment]
   * @returns {Comment}
   */
  applyInsert(cursor, length, extendComment = false) {
    let existingRangeExtended = false
    const newRanges = []

    for (const commentRange of this.ranges) {
      if (cursor === commentRange.end) {
        // insert right after the comment
        if (extendComment) {
          newRanges.push(commentRange.extendBy(length))
          existingRangeExtended = true
        } else {
          newRanges.push(commentRange)
        }
      } else if (cursor === commentRange.start) {
        // insert at the start of the comment
        if (extendComment) {
          newRanges.push(commentRange.extendBy(length))
          existingRangeExtended = true
        } else {
          newRanges.push(commentRange.moveBy(length))
        }
      } else if (commentRange.startIsAfter(cursor)) {
        // insert before the comment
        newRanges.push(commentRange.moveBy(length))
      } else if (commentRange.containsCursor(cursor)) {
        // insert is inside the comment
        if (extendComment) {
          newRanges.push(commentRange.extendBy(length))
          existingRangeExtended = true
        } else {
          const [rangeUpToCursor, , rangeAfterCursor] = commentRange.insertAt(
            cursor,
            length
          )

          // use current commentRange for the part before the cursor
          newRanges.push(new Range(commentRange.pos, rangeUpToCursor.length))
          // add the part after the cursor as a new range
          newRanges.push(rangeAfterCursor)
        }
      } else {
        // insert is after the comment
        newRanges.push(commentRange)
      }
    }

    // if the insert is not inside any range, add a new range
    if (extendComment && !existingRangeExtended) {
      newRanges.push(new Range(cursor, length))
    }

    return new Comment(newRanges, this.resolved)
  }

  /**
   *
   * @param {Range} deletedRange
   * @returns {Comment}
   */
  applyDelete(deletedRange) {
    const newRanges = []

    for (const commentRange of this.ranges) {
      if (commentRange.overlaps(deletedRange)) {
        newRanges.push(commentRange.subtract(deletedRange))
      } else if (commentRange.startsAfter(deletedRange)) {
        newRanges.push(commentRange.moveBy(-deletedRange.length))
      } else {
        newRanges.push(commentRange)
      }
    }

    return new Comment(newRanges, this.resolved)
  }

  /**
   *
   * @param {TextOperation} operation
   * @returns {Comment}
   */
  applyTextOperation(operation) {
    /** @type {Comment} */
    let comment = this
    let cursor = 0
    for (const op of operation.ops) {
      if (op instanceof RetainOp) {
        cursor += op.length
      } else if (op instanceof InsertOp) {
        comment = comment.applyInsert(cursor, op.insertion.length)
        cursor += op.insertion.length
      } else if (op instanceof RemoveOp) {
        comment = comment.applyDelete(new Range(cursor, op.length))
      }
    }
    return comment
  }

  isEmpty() {
    return this.ranges.length === 0
  }

  /**
   *
   * @returns {CommentRawData}
   */
  toRaw() {
    return {
      resolved: this.resolved,
      ranges: this.ranges.map(range => range.toRaw()),
    }
  }

  /**
   * @param {ReadonlyArray<Range>} ranges
   * @returns {ReadonlyArray<Range>}
   */
  mergeRanges(ranges) {
    /** @type {Range[]} */
    const mergedRanges = []

    const sortedRanges = [...ranges].sort((a, b) => a.start - b.start)
    for (const range of sortedRanges) {
      if (range.isEmpty()) {
        continue
      }
      const lastMerged = mergedRanges[mergedRanges.length - 1]

      if (lastMerged?.canMerge(range)) {
        mergedRanges[mergedRanges.length - 1] = lastMerged.merge(range)
      } else {
        mergedRanges.push(range)
      }
    }

    return mergedRanges
  }

  /**
   * @param {CommentRawData} rawComment
   * @returns {Comment}
   */
  static fromRaw(rawComment) {
    return new Comment(
      rawComment.ranges.map(range => Range.fromRaw(range)),
      rawComment.resolved
    )
  }
}

module.exports = Comment
