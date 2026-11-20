import Capacitor
import UIKit

/// The app's bridge view controller (tools/ipa.mjs points Main.storyboard at it): registers the
/// in-app GameCenter plugin when the app has one. Full screen comes from Info.plist
/// (UIStatusBarHidden, UIViewControllerBasedStatusBarAppearance = NO): CAPBridgeViewController
/// already defines the status-bar and home-indicator properties, so they are not overridden here.
class OyunViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        /*__PLUGINS__*/
    }
}
