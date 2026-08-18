import OrangeNavArrow from './OrangeNavArrow';

export default function DateNavigation({children,leftLabel,rightLabel,onPrevious,onNext}){
 return <section className="date-navigation"><div className="date-side previous"><button className="round-arrow" onClick={onPrevious} aria-label={leftLabel||'Previous'}><OrangeNavArrow direction="left"/></button>{leftLabel&&<span>{leftLabel}</span>}</div><div className="date-navigation-center">{children}</div><div className="date-side next">{rightLabel&&<span>{rightLabel}</span>}<button className="round-arrow" onClick={onNext} aria-label={rightLabel||'Next'}><OrangeNavArrow direction="right"/></button></div></section>;
}
