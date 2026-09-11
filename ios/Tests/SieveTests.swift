import Testing
@testable import Sieve

@Test func url() {
    #expect(sieveURL.host == "sieve.heyitsmejosh.com")
    #expect(sieveURL.scheme == "https")
}
