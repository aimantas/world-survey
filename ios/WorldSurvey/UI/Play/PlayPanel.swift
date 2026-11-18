import SwiftUI

/// The title block during a game: the question, then the answer card, over a row of counters.
struct PlayPanel: View {
    @Environment(AppModel.self) private var model
    let session: GameSession

    var body: some View {
        VStack(spacing: 0) {
            PanelHeader(title: session.config.title, detail: session.config.subtitle) {
                model.goHome()
            }
            PanelBody {
                Group {
                    if let round = session.round {
                        if round.kind == .higherLower {
                            HigherLowerView(session: session, round: round, next: next)
                        } else if let result = session.lastResult, session.phase == .revealed {
                            RevealView(session: session, result: result, next: next)
                        } else {
                            QuestionView(session: session, round: round)
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .id(session.round?.id ?? 0)
            .transition(.opacity)
            // Touching or scrolling the card keeps it up until Next.
            .simultaneousGesture(TapGesture().onEnded { session.holdAutoNext() })
            .simultaneousGesture(DragGesture(minimumDistance: 6).onChanged { _ in session.holdAutoNext() })
            PlayCounters(session: session)
                .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        }
        .animation(.easeInOut(duration: 0.22), value: session.phase)
        .animation(.easeInOut(duration: 0.22), value: session.round?.id)
        .sheetCard()
        .overlay(alignment: .top) {
            if let medal = session.freshMedals.first {
                MedalToast(medal: medal)
                    .offset(y: -56)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: session.freshMedals.first?.id)
    }

    private func next() {
        session.advance()
    }
}
