import { useSearchParams } from "react-router-dom";
import { Gallery } from "../components/media/Gallery";
import { PageHead } from "./Library";

export function Search() {
  const [sp] = useSearchParams();
  const q = sp.get("q") || "";
  return (
    <>
      <PageHead title={q ? `“${q}”` : "Tìm kiếm"} />
      <Gallery queryKey={["search", q]} query={{ q }} emptyTitle="Không tìm thấy media." />
    </>
  );
}
