---
title: 'FARO: a browser-based tool for qualitative and ethnographic research that codes inside Google Docs'
tags:
  - qualitative research
  - ethnography
  - qualitative data analysis
  - inter-coder agreement
  - browser extension
authors:
  - name: Micaela Gueler
    affiliation: 1
    # orcid: 0000-0000-0000-0000   (TODO: agregar)
  - name: Rocío Wegman
    affiliation: 1
    # orcid: 0000-0000-0000-0000   (TODO: agregar)
affiliations:
  - name: Escuela IDAES, Universidad Nacional de San Martín, Argentina
    index: 1
date: 4 November 2026
bibliography: paper.bib
---

<!-- BORRADOR para el Journal of Open Source Software. Revisar con Rocío antes de enviar. -->

# Summary

FARO (*Fichero Analítico de Registro y Observación*) is a free, open-source tool for qualitative
and ethnographic research that runs entirely in the web browser. It supports the full workflow of
interpretive research — field notes, interview transcripts, documents, coding with a codebook,
thick description [@geertz1973], code and actor networks, citation management and bibliography
recommendation — without servers, accounts or installation. The browser extension brings FARO to
where researchers already write: a panel inside Google Docs codes fragments of a document and stores
each code *inside the document* as a named range, so coding survives later editing; a companion
Google Docs add-on codes by direct selection; and web content can be captured with its URL and date
for digital ethnography. FARO also computes inter-coder agreement between researchers' projects:
Cohen's $\kappa$ [@cohen1960] for pairs and Krippendorff's $\alpha$ [@krippendorff2004] for two or
more coders.

# Statement of need

Qualitative data analysis software is dominated by commercial desktop packages (ATLAS.ti, NVivo,
MAXQDA) whose licence costs are a barrier for students and researchers in the Global South.
Open-source alternatives such as Taguette [@rampin2021] lowered that barrier, but still require
researchers to move their material out of the tools where they write it. Many students write field
notes and transcribe interviews directly in Google Docs, and code them later by copying fragments
into spreadsheets. FARO targets that gap: it codes in place, keeps data in the researcher's browser
or their own Drive, offers a bilingual Spanish/English interface, and recommends literature with
explicit North–South, gender and linguistic balance, verifying each reference against CrossRef to
reduce fabricated citations from language models.

# Functionality

- **Coding in Google Docs.** Codes are stored as Google Docs named ranges (`faro|<id>|<code>`), a
  convention shared by the extension and the add-on. Synchronisation maps Docs API indices to text
  offsets and reconciles annotations; when a document is edited without Google access, annotations
  are re-anchored by fuzzy quote matching and flagged when lost.
- **Inter-coder agreement.** For each material and code, every character is treated as coded or not
  by each researcher; Cohen's $\kappa$ is computed per code and pooled across materials, alongside
  agreement on coded text (characters coded by both over characters coded by at least one), with
  Landis and Koch's interpretation [@landis1977]. Results match `scikit-learn`'s
  `cohen_kappa_score` in the test suite. For two or more coders FARO computes Krippendorff's $\alpha$ [@krippendorff2004]
  for nominal data, matching the Python `krippendorff` package.
- **Reflexivity and rigour.** An automatic decision log records codebook changes (creation, renaming,
  redefinition, merging, deletion) alongside researchers' notes, and a saturation view plots new codes
  per material.
- **Interoperability.** Full project backups (optionally encrypted with AES-GCM) and REFI-QDA export.
- **Privacy by design.** No FARO servers; Google access uses only the non-sensitive per-file
  permission (`drive.file`): FARO sees the files it creates and the documents each researcher
  explicitly shares with it through Google's file picker, and nothing else in their Drive.

# Acknowledgements

<!-- TODO -->

# References
