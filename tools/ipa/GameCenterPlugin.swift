import Capacitor
import GameKit
import UIKit

/// Game Center leaderboards for the web game (Capacitor plugin "GameCenter"), the iOS twin of
/// tools/aab/PlayGamesPlugin.java with the same calls. Copied by tools/ipa.mjs only into apps
/// whose store/apps.json entry has a `gameCenter` block; do not edit the generated copy.
/// JS side: packages/core/src/online/online.ts.
///
/// Nothing here runs on its own. GKLocalPlayer's authenticateHandler (which is what starts Game
/// Center's sign-in) is set only from init(), and the game calls init() only after the player's
/// age answer says 13 or older. Children are never authenticated or scored.
///
/// Board ids: the game uses logical ids ("score", "wave"); Info.plist's GCBoards dictionary
/// (written from store/apps.json) holds the App Store Connect leaderboard id for each.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "init", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBoard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadMine", returnType: CAPPluginReturnPromise),
    ]

    private var initialised = false
    /// calls waiting for the first answer of the authenticate handler
    private var waiting: [CAPPluginCall] = []

    private func boards() -> [String: String] {
        return Bundle.main.object(forInfoDictionaryKey: "GCBoards") as? [String: String] ?? [:]
    }

    private func board(_ call: CAPPluginCall) -> String? {
        guard let logical = call.getString("board"), logical.range(of: "^[a-z][a-z0-9_]*$", options: .regularExpression) != nil else {
            call.reject("bad board id")
            return nil
        }
        guard let id = boards()[logical], !id.isEmpty else {
            call.reject("board not configured: " + logical)
            return nil
        }
        return id
    }

    private func status() -> [String: Any] {
        let me = GKLocalPlayer.local
        var r: [String: Any] = ["signedIn": me.isAuthenticated]
        if me.isAuthenticated { r["name"] = me.alias }
        return r
    }

    private func present(_ vc: UIViewController) {
        DispatchQueue.main.async {
            self.bridge?.viewController?.present(vc, animated: true)
        }
    }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["value": !boards().isEmpty])
    }

    /// Sets the authenticate handler (first call only): Game Center signs a returning player in
    /// silently, or hands us its sign-in screen, which is shown right away (the player has just
    /// opened online ranking). Resolves with the first answer.
    @objc func `init`(_ call: CAPPluginCall) {
        if initialised {
            call.resolve(status())
            return
        }
        initialised = true
        waiting.append(call)
        DispatchQueue.main.async {
            GKLocalPlayer.local.authenticateHandler = { [weak self] vc, _ in
                guard let self = self else { return }
                if let vc = vc {
                    self.present(vc)
                    return
                }
                let r = self.status()
                let calls = self.waiting
                self.waiting = []
                for c in calls { c.resolve(r) }
            }
        }
    }

    /// Interactive sign-in. Game Center offers its sign-in screen only through the handler; when
    /// the player dismissed it before, iOS wants them to sign in from Settings, so this answers
    /// signedIn false and the panel's retry message stands.
    @objc func signIn(_ call: CAPPluginCall) {
        if GKLocalPlayer.local.isAuthenticated {
            call.resolve(status())
            return
        }
        if !initialised {
            self.`init`(call)
            return
        }
        call.resolve(status())
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard initialised, GKLocalPlayer.local.isAuthenticated else { return call.reject("not signed in") }
        guard let id = board(call) else { return }
        guard let score = call.getInt("score"), score >= 0 else { return call.reject("bad score") }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func showBoard(_ call: CAPPluginCall) {
        guard initialised, GKLocalPlayer.local.isAuthenticated else { return call.reject("not signed in") }
        guard let id = board(call) else { return }
        DispatchQueue.main.async {
            let vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }

    /// The player's own all-time entry: {score, rank, display}; empty before the first score.
    @objc func loadMine(_ call: CAPPluginCall) {
        guard initialised, GKLocalPlayer.local.isAuthenticated else { return call.reject("not signed in") }
        guard let id = board(call) else { return }
        GKLeaderboard.loadLeaderboards(IDs: [id]) { boards, error in
            guard error == nil, let lb = boards?.first else { return call.resolve([:]) }
            lb.loadEntries(for: [GKLocalPlayer.local], timeScope: .allTime) { mine, _, error in
                guard error == nil, let e = mine else { return call.resolve([:]) }
                call.resolve(["score": e.score, "rank": e.rank, "display": e.formattedScore])
            }
        }
    }
}
