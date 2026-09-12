import textstat

sentences = {
    1: "The state to remove is therefore not the rule but its claim about itself.",
    2: "These files are filled with constructions nobody built.",
    3: "Three answers, all of them after the fact.",
    4: "Section 4.4 invites the suspicion that the resolver guesses.",
    5: "The only part that reads English is the one not allowed to decide anything. It proposes; the other two dispose.",
    6: "The audit found six problems: the config was stale, the hook silently no-ops on error, the guard reads a variable the harness never sets, the fallback path was never tested, the log rotates before anyone reads it, and the alert fires into a channel nobody watches.",
}

for k, s in sentences.items():
    print(f"--- Sentence {k} ---")
    print(s)
    print("words:", textstat.lexicon_count(s))
    print("sentences:", textstat.sentence_count(s))
    print("Flesch reading ease:", textstat.flesch_reading_ease(s))
    print("Flesch-Kincaid grade:", textstat.flesch_kincaid_grade(s))
    print("Gunning fog:", textstat.gunning_fog(s))
    print("SMOG:", textstat.smog_index(s))
    print("Coleman-Liau:", textstat.coleman_liau_index(s))
    print("ARI:", textstat.automated_readability_index(s))
    print("Dale-Chall:", textstat.dale_chall_readability_score(s))
    print("difficult words:", textstat.difficult_words(s))
    print()
