import SceneKit
import UIKit
import simd

/// What a tap on the globe hit.
struct GlobePick {
    let point: LatLng
    /// The country whose outline contains the point; nil over sea.
    let country: Country?
    /// Small states whose ring is under the finger, nearest first.
    let nearbyTiny: [Country]
}
