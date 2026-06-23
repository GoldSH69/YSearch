# YSearch

YouTube Data API v3를 사용하는 정적 영상 리서치 콘솔입니다. GitHub Pages 같은 무료 정적 호스팅에서 바로 실행할 수 있도록 서버와 데이터베이스를 사용하지 않습니다.

## 기능

- 업로드 날짜, 키워드, 국가, 언어, 정렬 조건으로 YouTube 영상 검색
- 영상 링크, 채널명, 구독자 수, 조회수, 댓글 수, 좋아요 수, 국가, 언어, Shorts 여부, 영상 길이, 키워드 표시
- 최소 조회수, 댓글 수, 좋아요 수, 구독자 수, 영상 길이 조건으로 추가 필터링
- CSV 다운로드
- API 키는 브라우저 localStorage에만 저장

## 무료로 사용하는 방법

1. Google Cloud Console에서 무료 YouTube Data API v3 키를 발급합니다.
2. GitHub Pages로 배포된 화면을 엽니다.
3. API 키와 검색 조건을 입력하고 검색합니다.

YouTube Data API는 무료 quota가 있으며, 이 앱의 검색 1회는 보통 `search.list` 100 units + `videos.list` 1 unit + `channels.list` 1 unit 정도를 사용합니다.

## 제한사항

- 구독자 수가 비공개인 채널은 최소 구독자 필터에서 제외됩니다.
- Shorts 여부는 YouTube 공식 Shorts 판정 API가 아니라 영상 길이 60초 이하 기준으로 판단합니다.
- 좋아요/댓글 수가 비공개 또는 비활성화된 영상은 0으로 표시될 수 있습니다.
- 국가 값은 영상 언어/채널 국가 정보를 기반으로 표시되며, 모든 영상에서 제공되지는 않습니다.
