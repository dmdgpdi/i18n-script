import { useState } from "react";
import viteLogo from "/vite.svg";
import reactLogo from "./assets/react.svg";
import "./App.css";
import { useTranslation } from "react-i18next";

function App() {
	const { t } = useTranslation();
	const [count, setCount] = useState(0);

	message.success({ title: "hello" });

	return (
		<>
			<div>
				<a href="https://vite.dev" target="_blank" rel="noopener">
					<img src={viteLogo} className="logo" alt="Vite logo" />
				</a>
				<a href="https://react.dev" target="_blank" rel="noopener">
					<img src={reactLogo} className="logo react" alt="React logo" />
				</a>
			</div>
			<h1>{t("hello")} 'hello'</h1>
			<div className="card">
				<button onClick={() => setCount((count) => count + 1)}>
					{t("count", { count })}
				</button>
				<p>{t("edit")}</p>
			</div>
			<p className="read-the-docs">{t("click")}</p>
		</>
	);
}

export default App;
