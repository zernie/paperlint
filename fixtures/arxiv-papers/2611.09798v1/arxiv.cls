
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{arxiv}[ArXiV]
\LoadClassWithOptions{article}

% Layout %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[top=2cm, bottom=2cm, left=2cm, right=2cm, columnsep=0.65cm]{geometry}
\RequirePackage{microtype}
\RequirePackage{placeins}
\RequirePackage{hyphenat}
\RequirePackage{setspace}
\RequirePackage{parskip}
\RequirePackage[latin, english]{babel}
\RequirePackage{lipsum}
\RequirePackage{etoolbox}

% Graphics %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{graphicx}
\RequirePackage{subcaption}

% Tables %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{booktabs}
\RequirePackage{nicematrix}
\RequirePackage{multirow}
\RequirePackage{bm}
\newcommand{\nm}[1]{#1}

% Color palette %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[most]{tcolorbox}
\RequirePackage{xcolor}
\definecolor{themeblue}{HTML}{6699CC}
\definecolor{themelink}{HTML}{3B6FCC}
\definecolor{themefg}{HTML}{333355}
\definecolor{themebg}{HTML}{F0F1F2}

% References %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[backref=page]{hyperref}
\RequirePackage[noabbrev,nameinlink]{cleveref}
\hypersetup{colorlinks,linkcolor=themeblue,citecolor=themelink,urlcolor=themelink}

\RequirePackage[round,authoryear]{natbib}
\def\bibfont{\small}

% Fonts %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Body text & math: Palatino
\RequirePackage[T1]{fontenc}
\RequirePackage{mathpazo}

% Sans‑serif face for title/author/abstract box: Montserrat
% Montserrat as \sffamily
\RequirePackage[medium]{montserrat}
\RequirePackage{mweights}
\renewcommand{\sfdefault}{Montserrat-OsF}

% Monospaced for code examples
\renewcommand*\ttdefault{cmvtt}

% Section & caption format %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{titlesec}
\titleformat*{\paragraph}{\itshape}
\titleformat*{\section}{\color{themefg}\Large\sansbf}
\titleformat*{\subsection}{\color{themefg}\large\sansbf}
\titleformat*{\subsubsection}{\color{themefg}\normalsize\sansbf}
\DeclareTextFontCommand{\textbf}{\color{themefg}\sansbf}

\RequirePackage{caption}
\DeclareCaptionLabelSeparator{custom}{}
\DeclareCaptionFormat{custom}{{\bfseries #1 #2} #3}
\captionsetup{singlelinecheck=false,format=custom,labelsep=custom,font=small}
\captionsetup[sub]{singlelinecheck=true,format=custom,labelsep=custom,font=small}

% Titlebox macros – authors, affiliations etc. %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\renewcommand\addtolist[5][]{%
  \begingroup
    \if\relax#3\relax\def\sep{}\else\def\sep{#5}\fi
    \let\protect\@unexpandable@protect
    \xdef#3{\expandafter{#3}\sep #4[#1]{#2}}%
  \endgroup
}

% Helper: bold sans (Montserrat via \sffamily)
\newcommand{\sansbf}[1]{{\sffamily\bfseries #1}}
\renewcommand{\textbf}[1]{{\sffamily\bfseries #1}}

\newcommand\authorlist{}
\newcommand\authorformat[2][]{{\sansbf{#2}\,$^{#1}$}}
\renewcommand\author[2][]{\addtolist[#1]{#2}{\authorlist}{\authorformat}{\hspace{1.5em}}}

\makeatletter
\newcommand{\authorbreak}{%
  \g@addto@macro\authorlist{\protect\\[0.25em]\hspace*{-1.5em}}%
}

\newcommand{\authorbigbreak}{%
  \g@addto@macro\authorlist{\protect\\[0.5em]\hspace*{-1.5em}}%
}
\makeatother
\newcommand\affiliationlist{}
\newcommand\affiliationformat[2][]{ {\normalsize\sffamily $^{#1}$#2}}
\newcommand\affiliation[2][]{\addtolist[#1]{#2}{\affiliationlist}{\affiliationformat}{\hspace{2em}}}

\newcommand\contributionlist{}
\newcommand\contributionformat[2][]{ {\small\sffamily $^{#1}$#2}}
\newcommand\contribution[2][]{\addtolist[#1]{#2}{\contributionlist}{\contributionformat}{\\[0.3em]}}

\newcommand\metadatalist{}
\newcommand\metadataformat[2][]{{\small\sffamily\bfseries #1: #2}}
\newcommand\metadata[2][]{\addtolist[#1]{#2}{\metadatalist}{\metadataformat}{\par}}

\makeatletter
\newcommand{\blankfootnote}[1]{%
  \begingroup
    \renewcommand{\thefootnote}{}%
    \renewcommand{\@makefnmark}{}%
    \renewcommand{\@makefntext}[1]{\noindent ##1}%
    \footnotetext{#1}%
    \addtocounter{footnote}{-1}%
  \endgroup
}
\makeatother

% Abstract – label + body sans
\renewcommand{\abstract}[1]{\def\abstractlist{{\sffamily\color{themefg} #1}}}

\newcommand{\email}[1]{\href{mailto:#1}{\texttt{#1}}}

\newcommand\correspondence[1]{\metadata[Correspondence]{#1}}

% Title uses sans bold
\renewcommand{\title}[1]{\newcommand{\titlelist}{{\huge\sansbf{#1}}}}
\newcommand{\beginappendix}{\appendix{\huge\bfseries Appendix\par}}

% Titlebox %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\newcommand{\mymaketitle}{%
  \begingroup
    \setlength{\parindent}{0pt}
    \setlength{\parskip}{0.5cm}
    {\setlength{\parskip}{0pt}\raggedright\nohyphens
      {\setstretch{1.618}\titlelist\par}
      \vskip 0.2cm
      \authorlist\par
      \vskip 0.2cm
      \affiliationlist\par
      \vskip 0.35cm
      \contributionlist\par}
    \abstractlist\par

    {\setlength{\parskip}{0pt}\ifdefempty{\metadatalist}{}{\metadatalist\par}}
  \endgroup
  \FloatBarrier
}

\if@twocolumn
  \renewcommand{\maketitle}{\twocolumn[\mymaketitle\vskip 0.38cm]}
\else
  \renewcommand{\maketitle}{\mymaketitle}
\fi
