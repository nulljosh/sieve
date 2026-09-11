import SwiftUI
import WebKit
import AuthenticationServices
import CryptoKit

@main
struct SiftboxApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
        #if os(macOS)
        .defaultSize(width: 480, height: 760)
        #endif
    }
}

let sieveBase = "https://siftbox.heyitsmejosh.com/?embed&native=1"
// iOS OAuth client (public, no secret — PKCE only). Same jaybulb-signin GCP project as the web client.
let iosClientID = "337798947774-m4fkg9dprksbbu8rbhei08cm1riuajti.apps.googleusercontent.com"
let iosRedirectScheme = "com.googleusercontent.apps.337798947774-m4fkg9dprksbbu8rbhei08cm1riuajti"
let iosRedirectURI = iosRedirectScheme + ":/oauth2redirect"

// Google blocks OAuth inside embedded WebViews (WKWebView), so the "Connect Gmail" link inside the
// web app points at this custom scheme instead of /auth/start when loaded with ?native=1 — the
// navigation delegate below intercepts it and hands off to the system browser via
// ASWebAuthenticationSession, which Google does allow.
@MainActor
final class GoogleAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = GoogleAuth()
    var session: ASWebAuthenticationSession?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(macOS)
        return NSApplication.shared.windows.first ?? ASPresentationAnchor()
        #else
        return UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first }.first ?? ASPresentationAnchor()
        #endif
    }

    func connect(completion: @escaping (URL?) -> Void) {
        var verifierBytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, verifierBytes.count, &verifierBytes)
        let verifier = Data(verifierBytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")

        var comps = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        comps.queryItems = [
            .init(name: "client_id", value: iosClientID),
            .init(name: "redirect_uri", value: iosRedirectURI),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: "https://www.googleapis.com/auth/gmail.modify"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
        ]

        let s = ASWebAuthenticationSession(url: comps.url!, callbackURLScheme: iosRedirectScheme) { callbackURL, _ in
            guard let callbackURL, let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value else { completion(nil); return }
            Task { completion(await GoogleAuth.shared.finish(code: code, verifier: verifier)) }
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = false
        session = s
        s.start()
    }

    // Exchanges the code directly with Google (public client, PKCE, no secret needed), then hands
    // the resulting tokens to sieve's own /auth/native to mint a session it can hand back as a bearer token.
    private func finish(code: String, verifier: String) async -> URL? {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let params = ["code": code, "client_id": iosClientID, "redirect_uri": iosRedirectURI, "grant_type": "authorization_code", "code_verifier": verifier]
        req.httpBody = params.map { "\($0.key)=\($0.value)" }.joined(separator: "&").data(using: .utf8)
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let tok = try? JSONDecoder().decode(GoogleToken.self, from: data) else { return nil }

        var native = URLRequest(url: URL(string: "https://siftbox.heyitsmejosh.com/auth/native")!)
        native.httpMethod = "POST"
        native.setValue("application/json", forHTTPHeaderField: "Content-Type")
        native.httpBody = try? JSONEncoder().encode(NativeAuth(access_token: tok.access_token, refresh_token: tok.refresh_token, expires_in: tok.expires_in, client_id: iosClientID))
        guard let (ndata, _) = try? await URLSession.shared.data(for: native),
              let sess = try? JSONDecoder().decode(NativeSession.self, from: ndata) else { return nil }
        return URL(string: sieveBase + "&token=" + sess.token)
    }
}

struct GoogleToken: Decodable { let access_token: String; let refresh_token: String; let expires_in: Int }
struct NativeAuth: Encodable { let access_token: String; let refresh_token: String; let expires_in: Int; let client_id: String }
struct NativeSession: Decodable { let token: String }

let sieveURL = URL(string: sieveBase)!

@MainActor
final class LoadState: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var loading = true
    @Published var failed = false
    weak var webView: WKWebView?

    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { loading = false; failed = false }
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { loading = false; failed = true }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { loading = false; failed = true }

    func webView(_ w: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.request.url?.scheme == "siftboxnative" else { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        GoogleAuth.shared.connect { [weak self] url in
            guard let url else { return }
            self?.webView?.load(URLRequest(url: url))
        }
    }
}

#if os(macOS)
struct WebView: NSViewRepresentable {
    let delegate: LoadState
    func makeNSView(context: Context) -> WKWebView {
        let web = WKWebView()
        web.navigationDelegate = delegate
        delegate.webView = web
        web.load(URLRequest(url: sieveURL))
        return web
    }
    func updateNSView(_ v: WKWebView, context: Context) {}
}
#else
struct WebView: UIViewRepresentable {
    let delegate: LoadState
    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView()
        web.navigationDelegate = delegate
        delegate.webView = web
        web.load(URLRequest(url: sieveURL))
        return web
    }
    func updateUIView(_ v: WKWebView, context: Context) {}
}
#endif

struct ContentView: View {
    @StateObject private var state = LoadState()
    var body: some View {
        ZStack {
            Color(white: 0.98).ignoresSafeArea()
            WebView(delegate: state).ignoresSafeArea()
            if state.loading {
                ProgressView()
            }
            if state.failed {
                VStack(spacing: 12) {
                    Text("Couldn't connect")
                    Button("Retry") { state.loading = true; state.failed = false }
                }
            }
        }
    }
}
