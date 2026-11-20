import Capacitor
import UIKit

/// The app's bridge view controller (tools/ipa.mjs points Main.storyboard at it): registers the
/// in-app GameCenter plugin when the app has one, and keeps the game full screen (no status bar,
/// the home indicator fades after a moment, edge swipes need a second swipe so a drag near the
/// bottom edge stays a game input).
class OyunViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        /*__PLUGINS__*/
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }
}
