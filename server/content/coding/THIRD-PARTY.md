# Coding prep — sources

`coding.json` is built by `scripts/build-coding.js` from these public
company-wise LeetCode lists (only finance firms are kept; links point to
leetcode.com, problem statements are not copied):

- liquidslr/leetcode-company-wise-problems — https://github.com/liquidslr/leetcode-company-wise-problems
- snehasishroy/leetcode-companywise-interview-questions — https://github.com/snehasishroy/leetcode-companywise-interview-questions
- krishnadey30/LeetCode-Questions-CompanyWise — https://github.com/krishnadey30/LeetCode-Questions-CompanyWise
- hxu296/leetcode-company-wise-problems-2022 (MIT) — https://github.com/hxu296/leetcode-company-wise-problems-2022

To refresh: shallow-clone the four repos into one directory and run
`node scripts/build-coding.js <that directory>`.
