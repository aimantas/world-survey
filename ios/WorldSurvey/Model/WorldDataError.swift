import Foundation
import simd

nonisolated enum WorldDataError: Error {
    case missing(String)
    case malformed(String)
}
