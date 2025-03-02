//Setup
  export default async function({login, q, imports, data, account}, {enabled = false} = {}) {
    //Plugin execution
      try {
        //Check if plugin is enabled and requirements are met
          if ((!enabled)||(!q.stackoverflow))
            return null

        //Load inputs
          let {sections, user, limit, lines, "lines.snippet":codelines} = imports.metadata.plugins.stackoverflow.inputs({data, account, q})
          if (!user)
            throw {error:{message:"You must provide a stackoverflow user id"}}

        //Initialization
        //See https://api.stackexchange.com/docs
          const api = {base:"https://api.stackexchange.com/2.2", user:`https://api.stackexchange.com/2.2/users/${user}`}
          const filters = {user:"!0Z-LvgkLYnTCu1858)*D0lcx2", answer:"!7goY5TLWwCz.BaGpe)tv5C6Bks2q8siMH6", question:"!)EhwvzgX*hrClxjLzqxiZHHbTPRE5Pb3B9vvRaqCx5-ZY.vPr"}
          const result = {sections, lines}

        //Stackoverflow user metrics
          {
            //Account metrics
              console.debug(`metrics/compute/${login}/plugins > stackoverflow > querying api for user ${user}`)
              const {data:{items:[{reputation, badge_counts:{bronze, silver, gold}, answer_count:answers, question_count:questions, view_count:views}]}} = await imports.axios.get(`${api.user}?site=stackoverflow&filter=${filters.user}`)
              const {data:{total:comments}} = await imports.axios.get(`${api.user}/comments?site=stackoverflow&filter=total`)
            //Save result
              result.user = {reputation, badges:bronze+silver+gold, questions, answers, comments, views}
          }

        //Answers
          for (const {key, sort} of [{key:"answers-recent", sort:"sort=activity&order=desc"}, {key:"answers-top", sort:"sort=votes&order=desc"}].filter(({key}) => sections.includes(key))) {
            //Load and format answers
              console.debug(`metrics/compute/${login}/plugins > stackoverflow > querying api for ${key}`)
              const {data:{items}} = await imports.axios.get(`${api.user}/answers?site=stackoverflow&pagesize=${limit}&filter=${filters.answer}&${sort}`)
              result[key] = await Promise.all(items.map(item => format.answer(item, {imports, data, codelines})))
              console.debug(`metrics/compute/${login}/plugins > stackoverflow > loaded ${result[key].length} items`)
            //Load related questions
              const ids = result[key].map(({question_id}) => question_id).filter(id => id)
              if (ids) {
                console.debug(`metrics/compute/${login}/plugins > stackoverflow > loading ${ids.length} related items`)
                const {data:{items}} = await imports.axios.get(`${api.base}/questions/${ids.join(";")}?site=stackoverflow&filter=${filters.question}`)
                await Promise.all(items.map(item => format.question(item, {imports, data, codelines})))
              }
          }

        //Questions
          for (const {key, sort} of [{key:"questions-recent", sort:"sort=activity&order=desc"}, {key:"questions-top", sort:"sort=votes&order=desc"}].filter(({key}) => sections.includes(key))) {
            //Load and format questions
              console.debug(`metrics/compute/${login}/plugins > stackoverflow > querying api for ${key}`)
              const {data:{items}} = await imports.axios.get(`${api.user}/questions?site=stackoverflow&pagesize=${limit}&filter=${filters.question}&${sort}`)
              result[key] = await Promise.all(items.map(item => format.question(item, {imports, data, codelines})))
              console.debug(`metrics/compute/${login}/plugins > stackoverflow > loaded ${result[key].length} items`)
            //Load related answers
              const ids = result[key].map(({accepted_answer_id}) => accepted_answer_id).filter(id => id)
              if (ids) {
                console.debug(`metrics/compute/${login}/plugins > stackoverflow > loading ${ids.length} related items`)
                const {data:{items}} = await imports.axios.get(`${api.base}/answers/${ids.join(";")}?site=stackoverflow&filter=${filters.answer}`)
                await Promise.all(items.map(item => format.answer(item, {imports, data, codelines})))
              }
          }

        //Results
          return result
      }
    //Handle errors
      catch (error) {
        if (error.error?.message)
          throw error
        throw {error:{message:"An error occured", instance:error}}
      }
  }

//Formatters
  const format = {
    /**Cached */
      cached:new Map(),
    /**Format stackoverflow code snippets */
      code(text) {
        return text.replace(/<!-- language: lang-(?<lang>\w+) -->\s*(?<snippet> {4}[\s\S]+?)(?=(?:<!-- end snippet -->)|(?:<!-- language: lang-))/g, "```$<lang>\n$<snippet>```")
      },
    /**Format answers */
      async answer({body_markdown:body, score, up_vote_count:upvotes, down_vote_count:downvotes, is_accepted:accepted, comment_count:comments = 0, creation_date, owner:{display_name:author}, link, answer_id:id, question_id}, {imports, data, codelines})  {
        const formatted = {type:"answer", body:await imports.markdown(format.code(imports.htmlunescape(body)), {codelines}), score, upvotes, downvotes, accepted, comments, author, created:imports.date(creation_date*1000, {dateStyle:"short", timeZone:data.config.timezone?.name}), link, id, question_id,
          get question() {
            return format.cached.get(`q${this.question_id}`) ?? null
          },
        }
        this.cached.set(`a${id}`, formatted)
        return formatted
      },
    /**Format questions */
      async question({title, body_markdown:body, score, up_vote_count:upvotes, down_vote_count:downvotes, favorite_count:favorites, tags, is_answered:answered, answer_count:answers, comment_count:comments, view_count:views, creation_date, owner:{display_name:author}, link, question_id:id, accepted_answer_id = null}, {imports, data, codelines}) {
        const formatted = {type:"question", title:await imports.markdown(title), body:await imports.markdown(format.code(imports.htmlunescape(body)), {codelines}), score, upvotes, downvotes, favorites, tags, answered, answers, comments, views, author, created:imports.date(creation_date*1000, {dateStyle:"short", timeZone:data.config.timezone?.name}), link, id, accepted_answer_id,
          get answer() {
            return format.cached.get(`a${this.accepted_answer_id}`) ?? null
          },
        }
        this.cached.set(`q${id}`, formatted)
        return formatted
      },
  }
